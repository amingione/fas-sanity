import path from 'node:path'
import { writeJson } from '../lib/utils.mjs'

export async function runCiVerdict({ outputDir, stepResults }) {
  let status = 'PASS'
  const failures = []

  for (const [name, result] of Object.entries(stepResults)) {
    const stepStatus = result.status || 'UNKNOWN'
    const requiresEnforcement = result.requiresEnforcement || false
    if (stepStatus === 'FAIL' || requiresEnforcement) {
      status = 'FAIL'
      failures.push({ step: name, status: stepStatus, requiresEnforcement })
    }
  }

  const verdict = {
    status,
    failures
  }

  await writeJson(path.join(outputDir, 'ci-verdict.json'), verdict)
  return verdict
}
