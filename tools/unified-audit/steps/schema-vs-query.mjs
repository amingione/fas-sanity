import { stableSort } from '../lib/utils.mjs'

export async function runSchemaVsQuery({ schemaIndex, queryIndex }) {
  const result = {
    status: 'PASS',
    missingInSchema: {},
    missingInQuery: {},
    requiresEnforcement: false,
    enforcementApproved: false
  }

  const schemaFieldsByType = schemaIndex.schemas || {}
  const allSchemaFields = new Set()
  for (const schema of Object.values(schemaFieldsByType)) {
    for (const field of schema.fields || []) {
      allSchemaFields.add(field)
    }
  }

  const queryFields = new Set(Object.keys(queryIndex.fieldsUsed || {}))

  const missingInSchema = [...queryFields].filter(field => !allSchemaFields.has(field))
  const missingInQuery = [...allSchemaFields].filter(field => !queryFields.has(field))

  if (missingInSchema.length > 0 || missingInQuery.length > 0) {
    result.status = 'WARN'
    result.requiresEnforcement = missingInSchema.length > 0
  }

  result.missingInSchema = stableSort(missingInSchema)
  result.missingInQuery = stableSort(missingInQuery)

  return result
}
