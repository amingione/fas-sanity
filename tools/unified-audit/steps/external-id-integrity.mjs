import fs from 'node:fs'
import path from 'node:path'
import { scanCodeFiles } from '../lib/scan.mjs'
import { uniqueSorted } from '../lib/utils.mjs'
import { writeJson } from '../lib/utils.mjs'

function isIdField(field) {
  return /Id(s)?$/.test(field)
}

function collectIdFieldsFromCode(files) {
  const ids = new Set()
  const regex = /\b([A-Za-z0-9_]+Id[s]?)\b/g
  for (const file of files) {
    let match
    regex.lastIndex = 0
    while ((match = regex.exec(file.contents))) {
      ids.add(match[1])
    }
  }
  return uniqueSorted(Array.from(ids))
}

export async function runExternalIdIntegrity(context) {
  const { repos, outputDir, schemaIndex, runtimeDocsByType, mappingIndex } = context
  const files = []

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    const filePaths = scanCodeFiles(repo.path)
    for (const filePath of filePaths) {
      const contents = fs.readFileSync(filePath, 'utf8')
      files.push({ path: filePath, contents })
    }
  }

  const schemaFields = mappingIndex?.allSchemaFields
    ? mappingIndex.allSchemaFields
    : uniqueSorted((schemaIndex?.types || []).flatMap((type) => type.fields || []))
  const requiredByType = mappingIndex?.requiredByType
    ? mappingIndex.requiredByType
    : Object.fromEntries(
      (schemaIndex?.types || []).map((type) => [type.name, type.required || []])
    )
  const schemaIdFields = schemaFields.filter(isIdField)
  const codeIdFields = collectIdFieldsFromCode(files)
  const idFields = uniqueSorted(schemaIdFields.concat(codeIdFields))

  const duplicates = {}
  const nullRates = {}
  const missingRequired = {}

  if (runtimeDocsByType) {
    for (const [typeName, docs] of Object.entries(runtimeDocsByType)) {
      const requiredIds = (requiredByType[typeName] || []).filter(isIdField)
      if (requiredIds.length && docs.length) {
        const missingForType = {}
        for (const field of requiredIds) {
          for (const doc of docs) {
            if (doc[field] === undefined || doc[field] === null || doc[field] === '') {
              if (!missingForType[field]) missingForType[field] = 0
              missingForType[field] += 1
            }
          }
        }
        if (Object.keys(missingForType).length) {
          missingRequired[typeName] = missingForType
        }
      }

      for (const field of idFields) {
        const values = new Map()
        let nullCount = 0
        for (const doc of docs) {
          const value = doc[field]
          if (value === undefined || value === null || value === '') {
            nullCount += 1
            continue
          }
          const count = values.get(value) || 0
          values.set(value, count + 1)
        }
        const dupes = Array.from(values.entries())
          .filter(([, count]) => count > 1)
          .map(([value, count]) => ({ value, count }))
        if (dupes.length) {
          if (!duplicates[typeName]) duplicates[typeName] = {}
          duplicates[typeName][field] = dupes
        }
        if (docs.length) {
          if (!nullRates[typeName]) nullRates[typeName] = {}
          nullRates[typeName][field] = nullCount / docs.length
        }
      }
    }
  }

  const hasDupes = Object.keys(duplicates).length > 0
  const hasMissingRequired = Object.keys(missingRequired).length > 0
  const output = {
    status: hasDupes || hasMissingRequired ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    idFields,
    duplicates,
    nullRates,
    missingRequired,
    notes: runtimeDocsByType ? null : 'Runtime scan unavailable; duplicates and missing required ids not computed.',
  }

  writeJson(path.join(outputDir, 'external-id-integrity.json'), output)
  return output
}
