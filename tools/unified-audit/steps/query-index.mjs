import fs from 'node:fs'
import path from 'node:path'
import { scanCodeFiles } from '../lib/scan.mjs'
import { buildQueryIndex } from '../lib/query.mjs'
import { writeJson } from '../lib/utils.mjs'

export async function runQueryIndex(context) {
  const { repos, outputDir } = context
  const files = []

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    const filePaths = scanCodeFiles(repo.path)
    for (const filePath of filePaths) {
      const contents = fs.readFileSync(filePath, 'utf8')
      files.push({ path: filePath, contents })
    }
  }

  if (files.length === 0) {
    const output = {
      status: 'SKIPPED',
      reason: 'No code files found',
      generatedAt: new Date().toISOString(),
      queries: [],
      fieldsUsed: {},
    }
    writeJson(path.join(outputDir, 'query-index.json'), output)
    return output
  }

  const output = buildQueryIndex(files)
  writeJson(path.join(outputDir, 'query-index.json'), output)
  return output
}
