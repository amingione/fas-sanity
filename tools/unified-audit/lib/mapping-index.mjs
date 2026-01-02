import { uniqueSorted } from './utils.mjs'

function normalizeFieldName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

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
  const normalizedSchema = new Map()
  const normalizedQuery = new Map()

  for (const field of allSchemaFields) {
    const normalized = normalizeFieldName(field)
    if (!normalizedSchema.has(normalized)) normalizedSchema.set(normalized, [])
    normalizedSchema.get(normalized).push(field)
  }

  for (const field of queryFields) {
    const normalized = normalizeFieldName(field)
    if (!normalizedQuery.has(normalized)) normalizedQuery.set(normalized, [])
    normalizedQuery.get(normalized).push(field)
  }

  const inferredMatches = []
  for (const [normalized, schemaList] of normalizedSchema.entries()) {
    const queryList = normalizedQuery.get(normalized)
    if (!queryList) continue
    inferredMatches.push({
      normalized,
      schemaFields: uniqueSorted(schemaList),
      queryFields: uniqueSorted(queryList),
    })
  }

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
    inferredMatches: inferredMatches.sort((a, b) => (a.normalized < b.normalized ? -1 : 1)),
    integrationHits: integrationInventory.hits || [],
    envKeys: integrationInventory.envKeys || {},
  }
}
