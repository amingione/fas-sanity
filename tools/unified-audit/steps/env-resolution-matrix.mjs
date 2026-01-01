import path from 'node:path'
import { buildEnvMatrix } from '../lib/env.mjs'
import { writeJson } from '../lib/utils.mjs'

export async function runEnvResolutionMatrix(context) {
  const { repos, outputDir, integrationInventory } = context

  const envKeys = integrationInventory?.envKeys
    ? Object.keys(integrationInventory.envKeys)
    : []

  const output = {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    ...buildEnvMatrix(repos, envKeys),
  }

  writeJson(path.join(outputDir, 'env-resolution-matrix.json'), output)
  return output
}
