import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import config from '../config.json' with { type: 'json' }
import { uniqueSorted } from './utils.mjs'

export function readEnvFiles(repoPath) {
  const entries = []
  for (const fileName of config.envFiles) {
    const filePath = path.join(repoPath, fileName)
    if (!fs.existsSync(filePath)) continue
    const contents = fs.readFileSync(filePath, 'utf8')
    const parsed = dotenv.parse(contents)
    entries.push({ file: filePath, values: parsed })
  }
  return entries
}

export function buildEnvMatrix(repos, envKeys) {
  const matrix = {
    repos: {},
    referencedKeys: uniqueSorted(envKeys),
    missingInRepo: {},
    unusedInRepo: {},
  }

  for (const repo of repos) {
    if (repo.status !== 'OK') {
      matrix.repos[repo.name] = {
        status: repo.status,
        reason: repo.reason,
        envFiles: [],
        definedKeys: [],
      }
      continue
    }

    const envFiles = readEnvFiles(repo.path)
    const definedKeys = uniqueSorted(
      envFiles.flatMap((entry) => Object.keys(entry.values || {}))
    )

    const missing = envKeys.filter((key) => !definedKeys.includes(key))
    const unused = definedKeys.filter((key) => !envKeys.includes(key))

    matrix.repos[repo.name] = {
      status: 'OK',
      envFiles: envFiles.map((entry) => entry.file),
      definedKeys,
    }

    matrix.missingInRepo[repo.name] = missing
    matrix.unusedInRepo[repo.name] = unused
  }

  return matrix
}

export function resolveEnvValue(keys, envEntries) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key]
  }
  for (const entry of envEntries) {
    for (const key of keys) {
      if (entry.values && entry.values[key]) return entry.values[key]
    }
  }
  return null
}

export function getSanityEnv(envEntries) {
  const projectId = resolveEnvValue(config.sanityEnvKeys.projectId, envEntries)
  const dataset = resolveEnvValue(config.sanityEnvKeys.dataset, envEntries)
  const token = resolveEnvValue(config.sanityEnvKeys.readToken, envEntries)
  return { projectId, dataset, token }
}
