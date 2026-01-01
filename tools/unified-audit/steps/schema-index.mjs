import path from 'node:path'
import { scanSchemaFiles } from '../lib/scan.mjs'
import { buildSchemaIndex } from '../lib/schema.mjs'
import { writeJson } from '../lib/utils.mjs'

export async function runSchemaIndex(context) {
  const { repos, outputDir } = context
  const schemaFiles = []

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    const files = scanSchemaFiles(repo.path)
    for (const file of files) {
      schemaFiles.push(file)
    }
  }

  if (schemaFiles.length === 0) {
    const output = {
      status: 'SKIPPED',
      reason: 'No schema files found',
      generatedAt: new Date().toISOString(),
      types: [],
    }
    writeJson(path.join(outputDir, 'schema-index.json'), output)
    return output
  }

  const output = buildSchemaIndex(schemaFiles)
  writeJson(path.join(outputDir, 'schema-index.json'), output)
  return output
}
