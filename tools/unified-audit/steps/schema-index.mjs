import { Project, SyntaxKind } from 'ts-morph'
import { listRepoFiles, relativeToRepo } from '../lib/file-scan.mjs'
import { stableSort, uniqueArray } from '../lib/utils.mjs'

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

function getPropertyValue(objectLiteral, propName) {
  const prop = objectLiteral.getProperty(propName)
  if (!prop || !prop.getInitializer) return null
  const init = prop.getInitializer()
  return init || null
}

function hasRequiredValidation(objectLiteral) {
  const validation = getPropertyValue(objectLiteral, 'validation')
  if (!validation) return false
  const text = validation.getText()
  return text.includes('required')
}

function extractFieldsFromArray(arrayLiteral) {
  const fields = []
  let hasNested = false
  for (const element of arrayLiteral.getElements()) {
    if (!element || !element.getKind) continue
    if (element.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      hasNested = true
      continue
    }
    const nameValue = getStringLiteral(getPropertyValue(element, 'name'))
    if (nameValue) {
      fields.push({
        name: nameValue,
        required: hasRequiredValidation(element)
      })
    }
    if (getPropertyValue(element, 'fields')) {
      hasNested = true
    }
  }
  return { fields, hasNested }
}

function extractSchemaFromObject(objectLiteral) {
  const nameValue = getStringLiteral(getPropertyValue(objectLiteral, 'name'))
  const typeValue = getStringLiteral(getPropertyValue(objectLiteral, 'type'))
  const fieldsProp = getPropertyValue(objectLiteral, 'fields')
  if (!nameValue || !typeValue || !fieldsProp) return null
  if (fieldsProp.getKind() !== SyntaxKind.ArrayLiteralExpression) return null
  const { fields, hasNested } = extractFieldsFromArray(fieldsProp)
  return { name: nameValue, type: typeValue, fields, hasNested }
}

export async function runSchemaIndex({ repos }) {
  const sanityRepo = repos.find(repo => repo.role === 'sanity')
  const result = {
    status: 'PASS',
    requiresEnforcement: false,
    enforcementApproved: false,
    schemas: {},
    errors: []
  }

  if (!sanityRepo) {
    result.status = 'SKIPPED'
    result.reason = 'No sanity repo configured'
    return result
  }

  const schemaFiles = await listRepoFiles(sanityRepo.path, ['schemas/**/*.{ts,tsx,js,jsx}'])
  if (schemaFiles.length === 0) {
    result.status = 'SKIPPED'
    result.reason = 'No schema files found'
    return result
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false
  })

  for (const filePath of schemaFiles) {
    const sourceFile = project.addSourceFileAtPath(filePath)
    const objects = []

    sourceFile.forEachDescendant(node => {
      if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
        objects.push(node)
      }
      if (node.getKind() === SyntaxKind.CallExpression) {
        const call = node
        const exprText = call.getExpression().getText()
        if (exprText === 'defineType' || exprText === 'defineField') {
          const arg = call.getArguments()[0]
          if (arg && arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
            objects.push(arg)
          }
        }
      }
    })

    for (const objectLiteral of objects) {
      const schema = extractSchemaFromObject(objectLiteral)
      if (!schema) continue
      if (schema.type !== 'document' && schema.type !== 'object') continue

      const existing = result.schemas[schema.name] || {
        fields: [],
        required: [],
        sources: [],
        partial: false
      }

      existing.fields.push(...schema.fields.map(field => field.name))
      existing.required.push(...schema.fields.filter(f => f.required).map(f => f.name))
      existing.sources.push(relativeToRepo(sanityRepo.path, filePath))
      if (schema.hasNested) existing.partial = true

      result.schemas[schema.name] = existing
    }
  }

  for (const [name, schema] of Object.entries(result.schemas)) {
    schema.fields = stableSort(uniqueArray(schema.fields))
    schema.required = stableSort(uniqueArray(schema.required))
    schema.sources = stableSort(uniqueArray(schema.sources))
    schema.partial = Boolean(schema.partial)
    result.schemas[name] = schema
  }

  return result
}
