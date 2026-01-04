import { normalizeKey, stableSort, uniqueArray } from './utils.mjs'

export function buildMappingIndex({ schemaIndex, queryIndex, integrations }) {
  const schemaFields = {}
  for (const [typeName, schema] of Object.entries(schemaIndex.schemas || {})) {
    for (const field of schema.fields || []) {
      const key = normalizeKey(field)
      if (!schemaFields[key]) {
        schemaFields[key] = { fields: new Set(), types: new Set() }
      }
      schemaFields[key].fields.add(field)
      schemaFields[key].types.add(typeName)
    }
  }

  const queryFields = {}
  for (const [field, usage] of Object.entries(queryIndex.fieldsUsed || {})) {
    const key = normalizeKey(field)
    if (!queryFields[key]) {
      queryFields[key] = { fields: new Set(), files: new Set() }
    }
    queryFields[key].fields.add(field)
    for (const file of usage.files || []) {
      queryFields[key].files.add(file)
    }
  }

  const correlations = []
  const allKeys = new Set([...Object.keys(schemaFields), ...Object.keys(queryFields)])
  for (const key of stableSort([...allKeys])) {
    correlations.push({
      normalized: key,
      schemaFields: schemaFields[key]
        ? uniqueArray([...schemaFields[key].fields])
        : [],
      schemaTypes: schemaFields[key]
        ? uniqueArray([...schemaFields[key].types])
        : [],
      queryFields: queryFields[key]
        ? uniqueArray([...queryFields[key].fields])
        : [],
      queryFiles: queryFields[key]
        ? uniqueArray([...queryFields[key].files])
        : []
    })
  }

  return {
    correlations,
    schemaFieldCount: Object.keys(schemaIndex.schemas || {}).length,
    queryFieldCount: Object.keys(queryIndex.fieldsUsed || {}).length,
    integrationHits: integrations?.hits?.length || 0
  }
}
