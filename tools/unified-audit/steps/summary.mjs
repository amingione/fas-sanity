import path from 'node:path'
import { writeJson, writeText } from '../lib/utils.mjs'

export async function runSummary({ outputDir, stepResults }) {
  const summary = {
    status: 'PASS',
    steps: {},
    generatedAt: new Date().toISOString(),
    outputDir
  }

  for (const [name, result] of Object.entries(stepResults)) {
    summary.steps[name] = {
      status: result.status || 'UNKNOWN',
      requiresEnforcement: result.requiresEnforcement || false
    }
    if (result.status === 'FAIL') summary.status = 'FAIL'
  }

  const summaryPath = path.join(outputDir, 'SUMMARY.json')
  await writeJson(summaryPath, summary)

  const lines = []
  lines.push(`# Unified Audit Summary`)
  lines.push('')
  lines.push(`Output: ${outputDir}`)
  lines.push('')
  for (const [name, step] of Object.entries(summary.steps)) {
    lines.push(`- ${name}: ${step.status}${step.requiresEnforcement ? ' (requiresEnforcement)' : ''}`)
  }

  await writeText(path.join(outputDir, 'SUMMARY.md'), lines.join('\n') + '\n')

  return { status: summary.status, summary }
}
