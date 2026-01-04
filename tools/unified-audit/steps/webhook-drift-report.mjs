import fs from 'node:fs/promises'
import { listRepoFiles, relativeToRepo } from '../lib/file-scan.mjs'
import { cleanSnippet } from '../lib/utils.mjs'

function isWebhookFile(filePath) {
  return /webhook/i.test(filePath)
}

export async function runWebhookDriftReport({ repos }) {
  const result = {
    status: 'PASS',
    handlers: [],
    warnings: []
  }

  const files = []
  for (const repo of repos) {
    const repoFiles = await listRepoFiles(repo.path, ['**/*.{ts,tsx,js,jsx,mjs,cjs}'])
    for (const file of repoFiles) files.push({ repo, file })
  }

  for (const { repo, file } of files) {
    if (!isWebhookFile(file)) continue
    const content = await fs.readFile(file, 'utf8')
    const rel = relativeToRepo(repo.path, file)
    const lines = content.split(/\r?\n/)

    let hasIdempotencyGuard = false
    for (const line of lines) {
      if (/idempot|dedupe|alreadyProcessed|idempotency/i.test(line)) {
        hasIdempotencyGuard = true
      }
    }

    let unsafeAccesses = 0
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (/event\./.test(line) && !/\?\./.test(line) && /\.data\./.test(line)) {
        unsafeAccesses += 1
        result.warnings.push({
          repo: repo.name,
          file: rel,
          lineNo: i + 1,
          message: 'Webhook payload field accessed without guard',
          snippet: cleanSnippet(line)
        })
      }
    }

    result.handlers.push({
      repo: repo.name,
      file: rel,
      idempotent: hasIdempotencyGuard,
      unsafeAccesses
    })
  }

  if (result.warnings.length > 0) {
    result.status = 'WARN'
  }

  return result
}
