import { Project, SyntaxKind } from 'ts-morph'
import { readText, sortBy, uniqueSorted } from './utils.mjs'

function getStringLiteral(node) {
  if (!node) return null
  if (node.getKind() === SyntaxKind.StringLiteral) {
    return node.getLiteralText()
  }
  if (node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return node.getLiteralText()
  }
  return null
}

function resolveFieldObject(element) {
  if (!element) return null
  if (element.getKind() === SyntaxKind.ObjectLiteralExpression) {
    return element
  }
  if (element.getKind() === SyntaxKind.CallExpression) {
    const callExpr = element
    const exprText = callExpr.getExpression().getText()
    if (exprText === 'defineField') {
      const arg = callExpr.getArguments()[0]
      if (arg && arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
        return arg
      }
    }
  }
  return null
}

function extractFields(fieldArray) {
  const fields = []
  const required = []
  let partial = false

  for (const element of fieldArray.getElements()) {
    const obj = resolveFieldObject(element)
    if (!obj) {
      partial = true
      continue
    }
    const nameProp = obj.getProperty('name')
    const nameValue = nameProp?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
    const name = getStringLiteral(nameValue)
    if (!name) {
      partial = true
      continue
    }
    fields.push(name)

    const validationProp = obj.getProperty('validation')
    if (validationProp) {
      const text = validationProp.getText()
      if (text.includes('.required(') || text.includes('Rule.required(')) {
        required.push(name)
      }
    }

    if (obj.getProperty('fields')) {
      partial = true
    }
  }

  return {
    fields: uniqueSorted(fields),
    required: uniqueSorted(required),
    partial,
  }
}

function extractSchemaFromObject(obj, sourceFile) {
  const nameProp = obj.getProperty('name')
  const typeProp = obj.getProperty('type')
  const nameValue = nameProp?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
  const name = getStringLiteral(nameValue)
  if (!name) return null

  const typeValue = typeProp?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
  const type = getStringLiteral(typeValue)
  const fieldsProp = obj.getProperty('fields')

  if (!fieldsProp) {
    return null
  }

  const initializer = fieldsProp.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
  if (!initializer) {
    return {
      name,
      type,
      fields: [],
      required: [],
      partial: true,
      sources: [sourceFile.getFilePath()],
    }
  }

  const extracted = extractFields(initializer)

  return {
    name,
    type,
    fields: extracted.fields,
    required: extracted.required,
    partial: extracted.partial,
    sources: [sourceFile.getFilePath()],
  }
}

export function buildSchemaIndex(schemaFiles) {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
    },
    useInMemoryFileSystem: true,
  })

  const fileMap = new Map()
  for (const file of schemaFiles) {
    fileMap.set(file, readText(file))
  }

  for (const [file, contents] of fileMap.entries()) {
    project.createSourceFile(file, contents, { overwrite: true })
  }

  const types = new Map()

  for (const sourceFile of project.getSourceFiles()) {
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    for (const call of callExpressions) {
      const expr = call.getExpression().getText()
      if (expr !== 'defineType') continue
      const arg = call.getArguments()[0]
      if (!arg || arg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue
      const schema = extractSchemaFromObject(arg, sourceFile)
      if (!schema) continue
      const existing = types.get(schema.name)
      if (existing) {
        existing.sources.push(sourceFile.getFilePath())
        existing.fields = uniqueSorted(existing.fields.concat(schema.fields))
        existing.required = uniqueSorted(existing.required.concat(schema.required))
        existing.partial = existing.partial || schema.partial
      } else {
        types.set(schema.name, schema)
      }
    }

    const exports = sourceFile.getExportAssignments()
    for (const assignment of exports) {
      const expression = assignment.getExpression()
      if (!expression || expression.getKind() !== SyntaxKind.ObjectLiteralExpression) continue
      const schema = extractSchemaFromObject(expression, sourceFile)
      if (!schema) continue
      const existing = types.get(schema.name)
      if (existing) {
        existing.sources.push(sourceFile.getFilePath())
        existing.fields = uniqueSorted(existing.fields.concat(schema.fields))
        existing.required = uniqueSorted(existing.required.concat(schema.required))
        existing.partial = existing.partial || schema.partial
      } else {
        types.set(schema.name, schema)
      }
    }
  }

  const output = sortBy(Array.from(types.values()), (item) => item.name)
  for (const type of output) {
    type.sources = uniqueSorted(type.sources)
  }

  return {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    types: output,
  }
}
