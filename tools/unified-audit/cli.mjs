#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import minimist from 'minimist'
import { fileURLToPath } from 'node:url'
import { resolveRepos, resolveOutDir } from './lib/paths.mjs'
import { nowStamp, writeJson } from './lib/utils.mjs'
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
import { runSummary, runCiVerdict } from './steps/summary.mjs'
import { buildMappingIndex } from './lib/mapping-index.mjs'

const argv = minimist(process.argv.slice(2))
const command = argv._[0] || 'run'

function baseDir() {
  return path.dirname(fileURLToPath(import.meta.url))
}

function skipOutput(outputDir, fileName, reason, extra = {}) {
  const payload = {
    status: 'SKIPPED',
    reason,
    generatedAt: new Date().toISOString(),
    ...extra,
  }
  writeJson(path.join(outputDir, fileName), payload)
  return payload
}

async function runCommand() {
  if (command === 'ci') {
    await runCi()
    return
  }

  const stamp = nowStamp()
  const outputDir = resolveOutDir(stamp)
  fs.mkdirSync(outputDir, { recursive: true })

  const repos = resolveRepos()
  const context = { repos, outputDir, results: {}, runtimeDocsByType: null }

  const runAll = command === 'run'
  const runSchemaOnly = command === 'schema'
  const runContractsOnly = command === 'contracts'
  const runEnvOnly = command === 'env'
  const runEnforcementOnly = command === 'enforcement'

  if (runAll || runSchemaOnly) {
    context.schemaIndex = await runSchemaIndex(context)
    context.results['schema-index'] = context.schemaIndex

    context.queryIndex = await runQueryIndex(context)
    context.results['query-index'] = context.queryIndex
  } else {
    context.schemaIndex = skipOutput(outputDir, 'schema-index.json', `Command ${command} skips schema steps`, { types: [] })
    context.queryIndex = skipOutput(outputDir, 'query-index.json', `Command ${command} skips schema steps`, { queries: [], fieldsUsed: {} })
    context.results['schema-index'] = context.schemaIndex
    context.results['query-index'] = context.queryIndex
  }

  if (runAll || runEnvOnly) {
    context.integrationsInventory = await runIntegrationsInventory(context)
    context.results['integrations-inventory'] = context.integrationsInventory

    context.envResolution = await runEnvResolutionMatrix({
      ...context,
      integrationInventory: context.integrationsInventory,
    })
    context.results['env-resolution-matrix'] = context.envResolution
  } else {
    context.integrationsInventory = skipOutput(outputDir, 'integrations-inventory.json', `Command ${command} skips env steps`, { hits: [], envKeys: {} })
    context.envResolution = skipOutput(outputDir, 'env-resolution-matrix.json', `Command ${command} skips env steps`, { repos: {}, referencedKeys: [], missingInRepo: {}, unusedInRepo: {} })
    context.results['integrations-inventory'] = context.integrationsInventory
    context.results['env-resolution-matrix'] = context.envResolution
  }

  context.mappingIndex = buildMappingIndex(
    context.schemaIndex || { types: [] },
    context.queryIndex || { fieldsUsed: {} },
    context.integrationsInventory || { hits: [], envKeys: {} }
  )

  if (runAll || runSchemaOnly) {
    context.schemaVsQuery = await runSchemaVsQuery({
      ...context,
      schemaIndex: context.schemaIndex,
      queryIndex: context.queryIndex,
      mappingIndex: context.mappingIndex,
    })
    context.results['schema-vs-query'] = context.schemaVsQuery

    context.runtimeScan = await runSanityRuntimeScan({
      ...context,
      schemaIndex: context.schemaIndex,
      mappingIndex: context.mappingIndex,
    })
    context.results['sanity-runtime-scan'] = context.runtimeScan
  } else {
    context.schemaVsQuery = skipOutput(outputDir, 'schema-vs-query.json', `Command ${command} skips schema steps`, { missingInSchema: [], unusedSchemaFields: [] })
    context.runtimeScan = skipOutput(outputDir, 'sanity-runtime-scan.json', `Command ${command} skips schema steps`, { types: {} })
    context.results['schema-vs-query'] = context.schemaVsQuery
    context.results['sanity-runtime-scan'] = context.runtimeScan
  }

  if (runAll || runContractsOnly) {
    context.apiContracts = await runApiContractViolations(context)
    context.results['api-contract-violations'] = context.apiContracts
  } else {
    context.apiContracts = skipOutput(outputDir, 'api-contract-violations.json', `Command ${command} skips contract checks`, {
      violations: [],
      requiresEnforcement: false,
      enforcementApproved: false,
    })
    context.results['api-contract-violations'] = context.apiContracts
  }

  if (runAll) {
    context.externalId = await runExternalIdIntegrity({
      ...context,
      schemaIndex: context.schemaIndex,
      runtimeDocsByType: context.runtimeDocsByType,
    })
    context.results['external-id-integrity'] = context.externalId
  } else {
    context.externalId = skipOutput(outputDir, 'external-id-integrity.json', `Command ${command} skips external id integrity`, {
      idFields: [],
      duplicates: {},
      nullRates: {},
    })
    context.results['external-id-integrity'] = context.externalId
  }

  if (runAll) {
    context.webhookDrift = await runWebhookDriftReport(context)
    context.results['webhook-drift-report'] = context.webhookDrift
  } else {
    context.webhookDrift = skipOutput(outputDir, 'webhook-drift-report.json', `Command ${command} skips webhook drift report`, {
      findings: [],
    })
    context.results['webhook-drift-report'] = context.webhookDrift
  }

  context.enforcement = await runEnforcementPrompts(context)
  context.results['codex-prompts'] = context.enforcement

  await runSummary({ outputDir, results: context.results })
  await runCiVerdict({ outputDir, results: context.results })

  console.log(`Audit outputs written to ${outputDir}`)
}

async function runCi() {
  const baseOverride = process.env.AUDIT_BASE
  let basePath
  if (baseOverride) {
    basePath = path.resolve(baseOverride)
  } else {
    const outDir = path.resolve(baseDir(), 'out')
    const entries = fs.existsSync(outDir) ? fs.readdirSync(outDir) : []
    const dirs = entries.filter((entry) => fs.statSync(path.join(outDir, entry)).isDirectory())
    dirs.sort()
    basePath = dirs.length ? path.join(outDir, dirs[dirs.length - 1]) : null
  }

  if (!basePath || !fs.existsSync(basePath)) {
    console.error('No audit output found for ci')
    process.exit(1)
  }

  const verdictPath = path.join(basePath, 'ci-verdict.json')
  if (fs.existsSync(verdictPath)) {
    const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'))
    if (verdict.status === 'FAIL') {
      process.exit(1)
    }
    process.exit(0)
  }

  const files = fs.readdirSync(basePath).filter((file) => file.endsWith('.json'))
  let failed = false
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(basePath, file), 'utf8'))
    if (data.status === 'FAIL' || data.requiresEnforcement) {
      failed = true
    }
  }

  process.exit(failed ? 1 : 0)
}

runCommand().catch((error) => {
  console.error(error)
  process.exit(1)
})
