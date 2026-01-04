import { createClient } from '@sanity/client'
import { stableSort } from '../lib/utils.mjs'

function resolveSanityConfig(env) {
  return {
    projectId: env.SANITY_STUDIO_PROJECT_ID || env.NEXT_PUBLIC_SANITY_PROJECT_ID || env.SANITY_STUDIO_PROJECT_ID,
    dataset: env.SANITY_STUDIO_DATASET || env.NEXT_PUBLIC_SANITY_DATASET || env.SANITY_STUDIO_DATASET,
    token: env.SANITY_API_TOKEN || env.SANITY_API_TOKEN || env.SANITY_API_TOKEN
  }
}

export async function runSanityRuntimeScan({ schemaIndex, repoEnvs, maxDocsPerType }) {
  const result = {
    status: 'PASS',
    requiresEnforcement: false,
    enforcementApproved: false,
    scannedTypes: {},
    skippedTypes: [],
    reason: null
  }

  const env = repoEnvs.find(entry => entry.role === 'sanity')?.env || {}
  const config = resolveSanityConfig(env)
  if (!config.projectId || !config.dataset) {
    result.status = 'SKIPPED'
    result.reason = 'Missing SANITY projectId or dataset'
    return result
  }

  const client = createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    token: config.token,
    useCdn: false,
    apiVersion: '2024-01-01'
  })

  let types = []
  try {
    types = await client.fetch('array::unique(*[]._type)')
  } catch (error) {
    result.status = 'SKIPPED'
    result.reason = `Sanity fetch failed: ${error instanceof Error ? error.message : String(error)}`
    return result
  }
  const schemaTypes = schemaIndex.schemas || {}

  for (const type of types) {
    if (!type) continue
    const schema = schemaTypes[type]
    if (!schema) {
      result.skippedTypes.push({ type, reason: 'No schema definition found' })
      continue
    }

    let docs = []
    try {
      docs = await client.fetch(
        `*[_type == $type][0...$limit]`,
        { type, limit: maxDocsPerType }
      )
    } catch (error) {
      result.scannedTypes[type] = {
        totalDocs: 0,
        missingRequired: {},
        nullCounts: {},
        unknownFields: {},
        sampleDocs: [],
        error: error instanceof Error ? error.message : String(error)
      }
      continue
    }

    const unknownFields = {}
    const nullCounts = {}
    const missingRequired = {}
    const requiredFields = new Set(schema.required || [])
    const knownFields = new Set(schema.fields || [])

    for (const field of schema.fields || []) {
      nullCounts[field] = 0
    }

    for (const doc of docs) {
      for (const field of Object.keys(doc)) {
        if (field.startsWith('_')) continue
        if (!knownFields.has(field)) {
          if (!unknownFields[field]) unknownFields[field] = 0
          unknownFields[field] += 1
        }
      }

      for (const field of knownFields) {
        if (!(field in doc)) continue
        if (doc[field] === null) {
          nullCounts[field] += 1
        }
      }

      for (const field of requiredFields) {
        if (doc[field] === undefined || doc[field] === null) {
          if (!missingRequired[field]) missingRequired[field] = []
          if (missingRequired[field].length < 25) {
            missingRequired[field].push(doc._id)
          }
        }
      }
    }

    const idFields = (schema.fields || []).filter(field => /id(s)?$/i.test(field))
    const sampleDocs = docs.map(doc => {
      const slim = { _id: doc._id }
      for (const field of idFields) {
        if (field in doc) slim[field] = doc[field]
      }
      return slim
    })

    result.scannedTypes[type] = {
      totalDocs: docs.length,
      missingRequired,
      nullCounts,
      unknownFields,
      sampleDocs
    }
  }

  result.skippedTypes = stableSort(result.skippedTypes.map(entry => entry.type))
  return result
}
