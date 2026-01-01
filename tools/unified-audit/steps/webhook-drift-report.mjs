import fs from 'node:fs'
import path from 'node:path'
import { scanCodeFiles } from '../lib/scan.mjs'
import { lineNumberForIndex } from '../lib/utils.mjs'
import { writeJson } from '../lib/utils.mjs'

const WEBHOOK_HINT = /webhook/i
const IDEMPOTENCY_HINT = /idempotent|dedupe|alreadyProcessed|processedEvents|event\.id/i
const UNSAFE_ACCESS = /event\.data\.object(?!\?)/

export async function runWebhookDriftReport(context) {
  const { repos, outputDir } = context
  const findings = []

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    const filePaths = scanCodeFiles(repo.path)
    for (const filePath of filePaths) {
      if (!WEBHOOK_HINT.test(filePath)) {
        const contents = fs.readFileSync(filePath, 'utf8')
        if (!WEBHOOK_HINT.test(contents)) continue
      }
      const contents = fs.readFileSync(filePath, 'utf8')
      const hasIdempotency = IDEMPOTENCY_HINT.test(contents)
      const unsafe = UNSAFE_ACCESS.test(contents)

      if (!hasIdempotency) {
        findings.push({
          type: 'idempotency',
          file: filePath,
          lineNo: lineNumberForIndex(contents, contents.search(WEBHOOK_HINT)),
          detail: 'No idempotency guard detected for webhook handler.',
        })
      }
      if (unsafe) {
        findings.push({
          type: 'payloadAccess',
          file: filePath,
          lineNo: lineNumberForIndex(contents, contents.search(UNSAFE_ACCESS)),
          detail: 'Webhook payload fields accessed without guard.',
        })
      }
    }
  }

  const status = findings.length ? 'WARN' : 'PASS'
  const output = {
    status,
    generatedAt: new Date().toISOString(),
    findings,
  }

  writeJson(path.join(outputDir, 'webhook-drift-report.json'), output)
  return output
}
