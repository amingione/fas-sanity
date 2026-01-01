import { uniqueSorted } from './utils.mjs'

export function buildMappingIndex(schemaIndex, queryIndex, integrationInventory) {
  const schemaFields = new Map()
  const requiredByType = new Map()
  for (const type of schemaIndex.types || []) {
    schemaFields.set(type.name, type.fields || [])
    requiredByType.set(type.name, type.required || [])
  }

  const allSchemaFields = uniqueSorted(
    Array.from(schemaFields.values()).flatMap((fields) => fields)
  )

  const queryFields = uniqueSorted(Object.keys(queryIndex.fieldsUsed || {}))

  return {
    generatedAt: new Date().toISOString(),
    schemaFields: Object.fromEntries(
      Array.from(schemaFields.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))
    ),
    requiredByType: Object.fromEntries(
      Array.from(requiredByType.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))
    ),
    allSchemaFields,
    queryFields,
    integrationHits: integrationInventory.hits || [],
    envKeys: integrationInventory.envKeys || {},
  }
}
