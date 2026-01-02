import fs from 'node:fs'
import path from 'node:path'
import config from '../config.json' with { type: 'json' }
import { scanCodeFiles, scanFunctionFiles, scanSchemaFiles } from '../lib/scan.mjs'
import { buildSchemaIndex } from '../lib/schema.mjs'
import { buildFunctionsAudit } from '../lib/functions-audit.mjs'
import { uniqueSorted, writeJson, writeText } from '../lib/utils.mjs'

function buildEnvIndex(repoPath) {
  const envIndex = new Map()
  for (const envFile of config.envFiles || []) {
    const filePath = path.resolve(repoPath, envFile)
    if (!fs.existsSync(filePath)) continue
    const contents = fs.readFileSync(filePath, 'utf8')
    const lines = contents.split('\n')
    lines.forEach((line, idx) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=/)
      if (!match) return
      const key = match[1]
      if (!envIndex.has(key)) envIndex.set(key, [])
      envIndex.get(key).push({
        filePath,
        lineNumber: idx + 1,
      })
    })
  }
  return envIndex
}

function buildDependenciesIndex(repoPath) {
  const pkgPath = path.resolve(repoPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return new Set()
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  }
  return new Set(Object.keys(deps))
}

function buildScheduleMap(repoPath) {
  const scheduleMap = new Map()
  const netlifyPath = path.resolve(repoPath, 'netlify.toml')
  if (!fs.existsSync(netlifyPath)) return scheduleMap
  const contents = fs.readFileSync(netlifyPath, 'utf8')
  const regex = /\[functions\."([^"]+)"\][\s\S]*?schedule\s*=\s*"([^"]+)"/g
  let match
  while ((match = regex.exec(contents)) !== null) {
    const name = match[1]
    const schedule = match[2]
    const lineNumber = contents.slice(0, match.index).split('\n').length
    scheduleMap.set(name, {
      schedule,
      sourceFile: netlifyPath,
      lineNumber,
    })
  }
  return scheduleMap
}

export async function runFunctionsAudit(context) {
  const { repos, outputDir } = context
  const functionFiles = []
  const codeFiles = []
  const schemaFiles = []
  const fileContentsByPath = new Map()
  const repoByFile = new Map()
  const envIndex = new Map()
  const dependenciesByRepo = new Map()
  const scheduleMap = new Map()

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    const repoFunctionFiles = scanFunctionFiles(repo.path)
    const repoCodeFiles = scanCodeFiles(repo.path)
    const repoSchemaFiles = scanSchemaFiles(repo.path)
    const repoEnvIndex = buildEnvIndex(repo.path)
    const repoDeps = buildDependenciesIndex(repo.path)
    const repoSchedules = buildScheduleMap(repo.path)

    for (const [key, entries] of repoEnvIndex.entries()) {
      if (!envIndex.has(key)) envIndex.set(key, [])
      envIndex.get(key).push(...entries)
    }

    dependenciesByRepo.set(repo.name, repoDeps)

    for (const [name, schedule] of repoSchedules.entries()) {
      scheduleMap.set(name, schedule)
    }

    for (const filePath of repoFunctionFiles) {
      functionFiles.push(filePath)
      repoByFile.set(filePath, repo.name)
    }
    for (const filePath of repoCodeFiles) {
      codeFiles.push(filePath)
      repoByFile.set(filePath, repo.name)
    }
    for (const filePath of repoSchemaFiles) {
      schemaFiles.push(filePath)
    }
  }

  const allFiles = uniqueSorted([...functionFiles, ...codeFiles, ...schemaFiles])
  for (const filePath of allFiles) {
    if (!fs.existsSync(filePath)) continue
    fileContentsByPath.set(filePath, fs.readFileSync(filePath, 'utf8'))
  }

  const schemaIndex = schemaFiles.length > 0 ? buildSchemaIndex(schemaFiles) : { types: [] }
  const schemaFields = schemaIndex.types
    ? uniqueSorted(schemaIndex.types.flatMap((type) => type.fields || []))
    : []

  const results = buildFunctionsAudit({
    functionFiles,
    fileContentsByPath,
    codeFiles,
    schemaFields,
    envIndex,
    dependenciesByRepo,
    scheduleMap,
    repoByFile,
  })

  const generatedAt = new Date().toISOString()
  const indexOutput = {
    status: 'OK',
    generatedAt,
    functions: results.functions,
  }

  const usageOutput = {
    status: 'OK',
    generatedAt,
    findings: [...results.usageFindings, ...results.shouldBeUsedFindings],
  }

  const brokenOutput = {
    status: results.brokenFindings.length > 0 ? 'WARN' : 'OK',
    generatedAt,
    findings: results.brokenFindings,
  }

  const duplicatesOutput = {
    status: results.duplicateFindings.length > 0 ? 'WARN' : 'OK',
    generatedAt,
    findings: results.duplicateFindings,
  }

  const obsoleteOutput = {
    status: results.obsoleteFindings.length > 0 ? 'WARN' : 'OK',
    generatedAt,
    findings: results.obsoleteFindings,
  }

  const summaryOutput = {
    status: 'OK',
    generatedAt,
    counts: {
      total: results.functions.length,
      inUse: results.usageFindings.length,
      shouldBeUsed: results.shouldBeUsedFindings.length,
      broken: results.brokenFindings.length,
      duplicate: results.duplicateFindings.length,
      obsolete: results.obsoleteFindings.length,
    },
    findings: {
      inUse: results.usageFindings,
      shouldBeUsed: results.shouldBeUsedFindings,
      broken: results.brokenFindings,
      duplicate: results.duplicateFindings,
      obsolete: results.obsoleteFindings,
    },
  }

  const summaryLines = [
    'Functions Audit Summary',
    '',
    `Total functions: ${summaryOutput.counts.total}`,
    `In use: ${summaryOutput.counts.inUse}`,
    `Should be used: ${summaryOutput.counts.shouldBeUsed}`,
    `Broken: ${summaryOutput.counts.broken}`,
    `Duplicate: ${summaryOutput.counts.duplicate}`,
    `Obsolete: ${summaryOutput.counts.obsolete}`,
    '',
  ]

  writeJson(path.join(outputDir, 'functions-index.json'), indexOutput)
  writeJson(path.join(outputDir, 'functions-usage.json'), usageOutput)
  writeJson(path.join(outputDir, 'functions-broken.json'), brokenOutput)
  writeJson(path.join(outputDir, 'functions-duplicates.json'), duplicatesOutput)
  writeJson(path.join(outputDir, 'functions-obsolete.json'), obsoleteOutput)
  writeJson(path.join(outputDir, 'functions-summary.json'), summaryOutput)
  writeText(path.join(outputDir, 'functions-summary.md'), `${summaryLines.join('\n')}\n`)

  return summaryOutput
}
