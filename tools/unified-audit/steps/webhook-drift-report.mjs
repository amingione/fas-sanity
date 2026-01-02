import path from 'node:path'
import { buildWebhookReport, scanWebhookFindings } from '../lib/scan.mjs'
import { writeJson } from '../lib/utils.mjs'

export async function runWebhookDriftReport(context) {
  const { repos, outputDir } = context
  const findings = []

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    findings.push(...scanWebhookFindings(repo.path))
  }

  const output = buildWebhookReport(findings)

  writeJson(path.join(outputDir, 'webhook-drift-report.json'), output)
  return output
}
