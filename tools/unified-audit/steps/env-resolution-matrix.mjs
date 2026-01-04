import { stableSort } from '../lib/utils.mjs'

export async function runEnvResolutionMatrix({ repos, repoEnvs, integrations }) {
  const result = {
    status: 'PASS',
    requiresEnforcement: false,
    enforcementApproved: false,
    referencedKeys: [],
    definedKeys: {},
    missingInRepo: {},
    unusedInRepo: {}
  }

  const referenced = new Set(Object.keys(integrations.envKeys || {}))
  result.referencedKeys = stableSort([...referenced])

  for (const repo of repos) {
    const envEntry = repoEnvs.find(entry => entry.name === repo.name)
    const definedKeys = envEntry ? Object.keys(envEntry.env) : []
    result.definedKeys[repo.name] = stableSort(definedKeys)
    const missing = result.referencedKeys.filter(key => !definedKeys.includes(key))
    result.missingInRepo[repo.name] = missing
    const unused = definedKeys.filter(key => !referenced.has(key))
    result.unusedInRepo[repo.name] = stableSort(unused)
    if (missing.length > 0) result.requiresEnforcement = true
  }

  return result
}
