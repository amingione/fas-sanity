import path from 'node:path'
import { writeJson } from '../lib/utils.mjs'

const DEFAULT_PHASES = {
  'webhook-drift-report': 'WARN',
  'api-contract-violations': 'FAIL',
}

export async function runCiVerdict(context) {
  const { outputDir, results } = context
  let status = 'PASS'
  const reasons = []
  const phasedEnforcement = {}

  for (const [name, result] of Object.entries(results)) {
    if (!result) continue

    const phase = result.enforcementPhase || DEFAULT_PHASES[name] || null
    if (phase) phasedEnforcement[name] = phase

    if (result.status === 'FAIL') {
      status = 'FAIL'
      reasons.push(`${name} status FAIL`)
    }

    if (result.requiresEnforcement) {
      if (phase !== 'WARN') {
        status = 'FAIL'
        reasons.push(`${name} requiresEnforcement true`)
      }
    }
  }

  const verdict = {
    status,
    generatedAt: new Date().toISOString(),
    reasons,
    phasedEnforcement,
  }

  writeJson(path.join(outputDir, 'ci-verdict.json'), verdict)
  return verdict
}
