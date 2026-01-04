#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import minimist from 'minimist'
import { loadConfig, readRepoEnv } from './lib/config.mjs'
import { ensureDir, nowStamp, writeJson } from './lib/utils.mjs'
import { runSchemaIndex } from './steps/schema-index.mjs'
import { runQueryIndex } from './steps/query-index.mjs'
import { runSchemaVsQuery } from './steps/schema-vs-query.mjs'
import { runSanityRuntimeScan } from './steps/sanity-runtime-scan.mjs'
import { runIntegrationsInventory } from './steps/integrations-inventory.mjs'
import { runEnvResolutionMatrix } from './steps/env-resolution-matrix.mjs'
import { runApiContractViolations } from './steps/api-contract-violations.mjs'
import { runExternalIdIntegrity } from './steps/external-id-integrity.mjs'
import { runWebhookDriftReport } from './steps/webhook-drift-report.mjs'
import { runEnforcementPrompts } from './steps/enforcement-prompts.mjs'
import { runSummary } from './steps/summary.mjs'
import { runCiVerdict } from './steps/ci-verdict.mjs'
import { buildMappingIndex } from './lib/mapping-index.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = minimist(process.argv.slice(2))
const command = args._[0]

const VALID_COMMANDS = ['run', 'schema', 'contracts', 'env', 'enforcement', 'ci']

if (!VALID_COMMANDS.includes(command)) {
  console.error(`Unknown command: ${command || ''}`)
  console.error('Usage: audit <run|schema|contracts|env|enforcement|ci>')
  process.exit(1)
}

const config = await loadConfig(__dirname)
const outputDir = path.join(__dirname, 'out', nowStamp())
await ensureDir(outputDir)

const repoEnvs = []
for (const repo of config.repos) {
  const { env, sources } = await readRepoEnv(repo.path, config.envFiles)
  repoEnvs.push({
    name: repo.name,
    role: repo.role,
    path: repo.path,
    env: { ...env, ...process.env },
    sources
  })
}

const stepResults = {}
let integrityError = false

async function runStep(name, shouldRun, handler) {
  const outputPath = path.join(outputDir, `${name}.json`)
  if (!shouldRun) {
    const skipped = { status: 'SKIPPED', reason: 'Step not requested' }
    stepResults[name] = skipped
    await writeJson(outputPath, skipped)
    return skipped
  }

  try {
    const result = await handler()
    stepResults[name] = result
    await writeJson(outputPath, result)
    return result
  } catch (error) {
    integrityError = true
    const failure = {
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error)
    }
    stepResults[name] = failure
    await writeJson(outputPath, failure)
    return failure
  }
}

const shouldRunAll = command === 'run' || command === 'ci'
const shouldRunSchema = shouldRunAll || command === 'schema'
const shouldRunContracts = shouldRunAll || command === 'contracts'
const shouldRunEnv = shouldRunAll || command === 'env'
const shouldRunEnforcement = true

const schemaIndex = await runStep('schema-index', shouldRunSchema, () => runSchemaIndex({ repos: config.repos }))
const queryIndex = await runStep('query-index', shouldRunSchema, () => runQueryIndex({ repos: config.repos }))

const integrationsInventory = await runStep('integrations-inventory', shouldRunEnv || shouldRunContracts || shouldRunAll, () =>
  runIntegrationsInventory({ repos: config.repos })
)

const mappingIndex = buildMappingIndex({
  schemaIndex,
  queryIndex,
  integrations: integrationsInventory
})

await runStep('schema-vs-query', shouldRunSchema, () =>
  runSchemaVsQuery({ schemaIndex, queryIndex, mappingIndex })
)

const sanityRuntimeScan = await runStep('sanity-runtime-scan', shouldRunSchema, () =>
  runSanityRuntimeScan({
    schemaIndex,
    repoEnvs,
    maxDocsPerType: config.maxDocsPerType
  })
)

await runStep('env-resolution-matrix', shouldRunEnv || shouldRunAll, () =>
  runEnvResolutionMatrix({ repos: config.repos, repoEnvs, integrations: integrationsInventory })
)

await runStep('api-contract-violations', shouldRunContracts || shouldRunAll, () =>
  runApiContractViolations({ repos: config.repos })
)

await runStep('external-id-integrity', shouldRunSchema || shouldRunAll, () =>
  runExternalIdIntegrity({ schemaIndex, runtimeScan: sanityRuntimeScan })
)

await runStep('webhook-drift-report', shouldRunSchema || shouldRunAll, () =>
  runWebhookDriftReport({ repos: config.repos })
)

await runStep('enforcement-prompts', shouldRunEnforcement || shouldRunAll, () =>
  runEnforcementPrompts({ outputDir })
)

await runSummary({ outputDir, stepResults })
const verdict = await runCiVerdict({ outputDir, stepResults })

if (command === 'ci' && verdict.status === 'FAIL') {
  process.exitCode = 1
}

if (integrityError) {
  process.exitCode = 1
}
