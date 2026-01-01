import path from 'node:path'
import { createClient } from '@sanity/client'
import config from '../config.json' assert { type: 'json' }
import { getSanityEnv, readEnvFiles } from '../lib/env.mjs'
import { writeJson } from '../lib/utils.mjs'

const API_VERSION = '2024-01-01'

function collectEnvEntries(repos) {
  const entries = []
  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    entries.push(...readEnvFiles(repo.path))
  }
  return entries
}

function isSystemField(field) {
  return field.startsWith('_')
}

export async function runSanityRuntimeScan(context) {
  const { repos, outputDir, schemaIndex, mappingIndex } = context

  if (!schemaIndex || schemaIndex.status !== 'OK') {
    const output = {
      status: 'SKIPPED',
      reason: 'Schema index unavailable',
      generatedAt: new Date().toISOString(),
      types: {},
    }
    writeJson(path.join(outputDir, 'sanity-runtime-scan.json'), output)
    return output
  }

  const envEntries = collectEnvEntries(repos)
  const { projectId, dataset, token } = getSanityEnv(envEntries)

  if (!projectId || !dataset) {
    const output = {
      status: 'SKIPPED',
      reason: 'Missing Sanity projectId or dataset',
      generatedAt: new Date().toISOString(),
      types: {},
    }
    writeJson(path.join(outputDir, 'sanity-runtime-scan.json'), output)
    return output
  }

  const client = createClient({
    projectId,
    dataset,
    token: token || undefined,
    apiVersion: API_VERSION,
    useCdn: false,
  })

  const typesOutput = {}
  const docsByType = {}

  for (const type of schemaIndex.types || []) {
    const typeName = type.name
    const maxDocs = config.maxDocsPerType

    let docs = []
    try {
      docs = await client.fetch('*[_type == $type][0...$limit]', {
        type: typeName,
        limit: maxDocs,
      })
    } catch (error) {
      typesOutput[typeName] = {
        status: 'ERROR',
        error: error?.message || String(error),
      }
      continue
    }

    docsByType[typeName] = docs

    const missingRequired = {}
    const nullCounts = {}
    const unknownFields = {}
    const schemaFields = mappingIndex?.schemaFields?.[typeName] || type.fields || []
    const requiredFields = mappingIndex?.requiredByType?.[typeName] || type.required || []

    for (const field of schemaFields) {
      nullCounts[field] = 0
    }

    for (const doc of docs) {
      for (const field of requiredFields) {
        if (doc[field] === undefined || doc[field] === null) {
          if (!missingRequired[field]) {
            missingRequired[field] = []
          }
          if (missingRequired[field].length < 25) {
            missingRequired[field].push(doc._id)
          }
        }
      }

      for (const field of schemaFields) {
        if (doc[field] === null) {
          nullCounts[field] = (nullCounts[field] || 0) + 1
        }
      }

      for (const key of Object.keys(doc)) {
        if (isSystemField(key)) continue
        if (!schemaFields.includes(key)) {
          unknownFields[key] = (unknownFields[key] || 0) + 1
        }
      }
    }

    typesOutput[typeName] = {
      status: 'OK',
      documentCount: docs.length,
      missingRequired,
      nullCounts,
      unknownFields,
    }
  }

  const output = {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    projectId,
    dataset,
    types: typesOutput,
  }

  writeJson(path.join(outputDir, 'sanity-runtime-scan.json'), output)
  context.runtimeDocsByType = docsByType
  return output
}
