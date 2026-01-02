import path from 'node:path'
import { writeJson, writeText } from '../lib/utils.mjs'

export async function runSummary(context) {
  const { outputDir, results } = context
  const summary = {
    generatedAt: new Date().toISOString(),
    steps: results,
  }

  const lines = ['Unified Audit Summary', '']
  for (const [name, result] of Object.entries(results)) {
    lines.push(`${name}: ${result.status || 'UNKNOWN'}`)
  }

  writeJson(path.join(outputDir, 'SUMMARY.json'), summary)
  writeText(path.join(outputDir, 'SUMMARY.md'), `${lines.join('\n')}\n`)

  return summary
}
