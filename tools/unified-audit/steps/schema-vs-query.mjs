import path from 'node:path'
import { uniqueSorted } from '../lib/utils.mjs'
import { writeJson } from '../lib/utils.mjs'

export async function runSchemaVsQuery(context) {
  const { outputDir, schemaIndex, queryIndex, mappingIndex } = context

  if (!schemaIndex || !queryIndex || schemaIndex.status !== 'OK' || queryIndex.status !== 'OK') {
    const output = {
      status: 'SKIPPED',
      reason: 'Schema or query index missing',
      generatedAt: new Date().toISOString(),
      missingInSchema: [],
      unusedSchemaFields: [],
      inferredMatches: [],
    }
    writeJson(path.join(outputDir, 'schema-vs-query.json'), output)
    return output
  }

  const schemaFields = mappingIndex?.allSchemaFields
    ? mappingIndex.allSchemaFields
    : uniqueSorted((schemaIndex.types || []).flatMap((type) => type.fields || []))
  const queryFields = mappingIndex?.queryFields
    ? mappingIndex.queryFields
    : uniqueSorted(Object.keys(queryIndex.fieldsUsed || {}))

  const missingInSchema = queryFields.filter((field) => !schemaFields.includes(field))
  const unusedSchemaFields = schemaFields.filter((field) => !queryFields.includes(field))

  const output = {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    missingInSchema,
    unusedSchemaFields,
    inferredMatches: mappingIndex?.inferredMatches || [],
  }

  writeJson(path.join(outputDir, 'schema-vs-query.json'), output)
  return output
}
