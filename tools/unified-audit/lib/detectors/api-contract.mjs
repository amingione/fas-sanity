import { Project, SyntaxKind } from 'ts-morph'
import { lineNumberForIndex } from '../utils.mjs'

const project = new Project({
  useInMemoryFileSystem: true,
  skipFileDependencyResolution: true,
  compilerOptions: { allowJs: true },
})

function getSourceFile(filePath, fileContent) {
  const existing = project.getSourceFile(filePath)
  if (existing) {
    existing.replaceWithText(fileContent)
    return existing
  }
  return project.createSourceFile(filePath, fileContent)
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '')
}

export function extractVariableAssignments(ast) {
  const assignments = new Map()
  if (!ast) return assignments

  const declarations = ast.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
  for (const declaration of declarations) {
    const initializer = declaration.getInitializer()
    if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) continue

    const fields = new Set()
    for (const prop of initializer.getProperties()) {
      if (prop.getKind() === SyntaxKind.PropertyAssignment) {
        const nameNode = prop.getNameNode()
        if (nameNode) {
          fields.add(stripQuotes(nameNode.getText()))
        }
      } else if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
        fields.add(prop.getName())
      } else if (prop.getKind() === SyntaxKind.SpreadAssignment) {
        const expr = prop.getExpression()
        if (expr && expr.getKind() === SyntaxKind.Identifier) {
          const spreadName = expr.getText()
          const spreadFields = assignments.get(spreadName)
          if (spreadFields) {
            for (const field of spreadFields) fields.add(field)
          }
        }
      }
    }

    const name = declaration.getName()
    if (name) assignments.set(name, fields)
  }

  return assignments
}

export function extractInlineObjectFields(startIndex, fileContent) {
  const openIndex = fileContent.indexOf('{', startIndex)
  if (openIndex === -1) return new Set()
  let depth = 0
  let inString = false
  let stringChar = ''
  let endIndex = -1

  for (let i = openIndex; i < fileContent.length; i += 1) {
    const char = fileContent[i]
    if (inString) {
      if (char === stringChar && fileContent[i - 1] !== '\\') {
        inString = false
      }
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      inString = true
      stringChar = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        endIndex = i
        break
      }
    }
  }

  if (endIndex === -1) return new Set()
  const literal = fileContent.slice(openIndex, endIndex + 1)
  return parseObjectKeys(literal)
}

function parseObjectKeys(objectLiteral) {
  const keys = new Set()
  let depth = 0
  let inString = false
  let stringChar = ''
  let buffer = ''

  const flushBuffer = () => {
    const trimmed = buffer.trim()
    buffer = ''
    if (!trimmed || trimmed.startsWith('...')) return
    const keyMatch = trimmed.match(
      /^"([^"]+)"\s*:|^'([^']+)'\s*:|^([A-Za-z0-9_]+)\s*:/,
    )
    if (keyMatch) {
      const key = keyMatch[1] || keyMatch[2] || keyMatch[3]
      if (key) keys.add(key)
      return
    }
    if (/^[A-Za-z0-9_]+$/.test(trimmed)) {
      keys.add(trimmed)
    }
  }

  for (let i = 0; i < objectLiteral.length; i += 1) {
    const char = objectLiteral[i]
    if (inString) {
      if (char === stringChar && objectLiteral[i - 1] !== '\\') {
        inString = false
      }
      if (depth === 1) buffer += char
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      inString = true
      stringChar = char
      if (depth === 1) buffer += char
      continue
    }
    if (char === '{' || char === '[' || char === '(') {
      depth += 1
      if (depth === 1) buffer = ''
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      if (depth === 1) flushBuffer()
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 1) {
      if (char === ',') {
        flushBuffer()
        continue
      }
      buffer += char
    }
  }

  return keys
}

export function checkRequiredFields(objectFields, required) {
  const missing = []
  for (const field of required) {
    if (Array.isArray(field)) {
      const hasAny = field.some((item) => objectFields.has(item))
      if (!hasAny) missing.push(field)
    } else if (!objectFields.has(field)) {
      missing.push(field)
    }
  }
  return missing
}

export function detectApiContractViolation(filePath, fileContent, ast) {
  if (/(Validation|validator)\.ts$/.test(filePath)) return []
  if (/easypostValidation\.ts$/.test(filePath)) return []
  if (/resendValidation\.ts$/.test(filePath)) return []

  const sourceFile = ast || getSourceFile(filePath, fileContent)
  const assignments = extractVariableAssignments(sourceFile)
  const violations = []

  const apiContracts = [
    {
      pattern: /easypost\.Shipment\.create\s*\(\s*(\w+|\{)/gi,
      service: 'easypost',
      operation: 'Shipment.create',
      required: ['to_address', 'from_address', 'parcel'],
    },
    {
      pattern: /resend\.emails\.send\s*\(\s*(\w+|\{)/gi,
      service: 'resend',
      operation: 'emails.send',
      required: ['to', 'from', 'subject', ['html', 'text']],
    },
  ]

  for (const contract of apiContracts) {
    const matches = [...fileContent.matchAll(contract.pattern)]
    for (const match of matches) {
      const callIndex = match.index ?? 0
      const varOrObject = match[1]

      let objectFields
      if (varOrObject === '{') {
        objectFields = extractInlineObjectFields(callIndex, fileContent)
      } else {
        objectFields = assignments.get(varOrObject) || new Set()
      }

      const missingFields = checkRequiredFields(objectFields, contract.required)
      for (const field of missingFields) {
        if (Array.isArray(field)) {
          violations.push({
            type: 'missingField',
            service: contract.service,
            file: filePath,
            lineNo: lineNumberForIndex(fileContent, callIndex),
            fieldPath: field.join(' OR '),
            recommendedFix: `Ensure one of [${field.join(', ')}] is set before ${contract.operation} call.`,
          })
        } else {
          violations.push({
            type: 'missingField',
            service: contract.service,
            file: filePath,
            lineNo: lineNumberForIndex(fileContent, callIndex),
            fieldPath: field,
            recommendedFix: `Ensure required ${contract.service} field '${field}' is set before ${contract.operation} call.`,
          })
        }
      }
    }
  }

  return violations
}
