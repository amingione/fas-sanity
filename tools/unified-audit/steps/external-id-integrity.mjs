function isIdField(field) {
  return /id(s)?$/i.test(field)
}

export async function runExternalIdIntegrity({ schemaIndex, runtimeScan }) {
  const result = {
    status: 'PASS',
    idFields: {},
    duplicates: {},
    nullRates: {}
  }

  const schemaTypes = schemaIndex.schemas || {}
  for (const [type, schema] of Object.entries(schemaTypes)) {
    result.idFields[type] = (schema.fields || []).filter(isIdField)
  }

  if (!runtimeScan || runtimeScan.status !== 'PASS') {
    result.status = 'SKIPPED'
    result.reason = 'Runtime scan unavailable'
    return result
  }

  for (const [type, scan] of Object.entries(runtimeScan.scannedTypes || {})) {
    const idFields = result.idFields[type] || []
    for (const field of idFields) {
      const fieldNulls = scan.nullCounts?.[field] || 0
      result.nullRates[`${type}.${field}`] = {
        nulls: fieldNulls,
        total: scan.totalDocs
      }
    }

    const seen = {}
    for (const field of idFields) {
      seen[field] = new Map()
    }

    for (const doc of scan.sampleDocs || []) {
      for (const field of idFields) {
        const value = doc[field]
        if (!value) continue
        const map = seen[field]
        map.set(value, (map.get(value) || 0) + 1)
      }
    }

    for (const field of idFields) {
      const duplicates = []
      const map = seen[field]
      if (!map) continue
      for (const [value, count] of map.entries()) {
        if (count > 1) duplicates.push({ value, count })
      }
      if (duplicates.length > 0) {
        result.duplicates[`${type}.${field}`] = duplicates
      }
    }
  }

  const hasRequiredIdMissing = Object.entries(runtimeScan.scannedTypes || {}).some(
    ([type, scan]) => {
      const required = new Set(schemaIndex.schemas?.[type]?.required || [])
      return (result.idFields[type] || []).some(field =>
        required.has(field) && (scan.missingRequired?.[field]?.length || 0) > 0
      )
    }
  )

  if (Object.keys(result.duplicates).length > 0 || hasRequiredIdMissing) {
    result.status = 'FAIL'
  }

  return result
}
