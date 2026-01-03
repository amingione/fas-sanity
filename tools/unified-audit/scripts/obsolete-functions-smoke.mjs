#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import minimist from 'minimist'
import {sortBy, writeJson} from '../lib/utils.mjs'

function usage() {
  console.log(
    'Usage: node tools/unified-audit/scripts/obsolete-functions-smoke.mjs --input <functions-summary.json> [--out <output.json>]',
  )
}

function detectHandlersFromSource(contents) {
  const handlers = new Set()
  const patterns = [
    /export\s+const\s+handler\b/,
    /export\s+async\s+function\s+handler\b/,
    /exports\.handler\b/,
    /module\.exports\.handler\b/,
    /export\s+default\b/,
  ]
  for (const pattern of patterns) {
    if (pattern.test(contents)) handlers.add('handler')
  }
  const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
  for (const method of httpMethods) {
    const methodRegex = new RegExp(`export\\s+(const|function)\\s+${method}\\b`)
    if (methodRegex.test(contents)) handlers.add(method)
  }
  return Array.from(handlers).sort()
}

async function detectHandlersFromModule(filePath) {
  const moduleUrl = pathToFileURL(filePath).href
  const mod = await import(moduleUrl)
  const handlers = new Set()
  if (mod.handler || mod.default) handlers.add('handler')
  const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
  for (const method of httpMethods) {
    if (typeof mod[method] === 'function') handlers.add(method)
  }
  return Array.from(handlers).sort()
}

async function run() {
  const argv = minimist(process.argv.slice(2))
  const inputPath = argv.input || argv._[0]
  if (!inputPath) {
    usage()
    process.exit(1)
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const obsolete = input.findings?.obsolete || []
  const outputDir = path.dirname(inputPath)
  const outPath = argv.out || path.join(outputDir, 'functions-health.json')

  const results = []
  for (const item of obsolete) {
    const filePath = item.filePath
    const ext = path.extname(filePath).toLowerCase()
    const record = {
      classification: 'OBSOLETE',
      filePath,
      status: 'SKIPPED',
      reason: null,
      handlers: [],
      mode: null,
    }

    if (!fs.existsSync(filePath)) {
      record.status = 'ERROR'
      record.reason = 'File does not exist'
      results.push(record)
      continue
    }

    const contents = fs.readFileSync(filePath, 'utf8')
    const sourceHandlers = detectHandlersFromSource(contents)

    if (ext === '.ts' || ext === '.tsx') {
      record.status = sourceHandlers.length > 0 ? 'OK' : 'WARN'
      record.reason =
        sourceHandlers.length > 0
          ? 'TypeScript file inspected (static handler detection)'
          : 'No handler export detected (static scan)'
      record.handlers = sourceHandlers
      record.mode = 'static'
      results.push(record)
      continue
    }

    try {
      const handlers = await detectHandlersFromModule(filePath)
      record.status = handlers.length > 0 ? 'OK' : 'WARN'
      record.reason =
        handlers.length > 0
          ? 'Module loaded (export scan)'
          : 'No handler export detected (module scan)'
      record.handlers = handlers
      record.mode = 'import'
    } catch (error) {
      record.status = 'ERROR'
      record.reason = error instanceof Error ? error.message : String(error)
      record.handlers = sourceHandlers
      record.mode = 'import'
    }

    results.push(record)
  }

  const sorted = sortBy(results, (item) => item.filePath)
  const summary = {
    generatedAt: new Date().toISOString(),
    counts: {
      total: sorted.length,
      ok: sorted.filter((item) => item.status === 'OK').length,
      warn: sorted.filter((item) => item.status === 'WARN').length,
      error: sorted.filter((item) => item.status === 'ERROR').length,
      skipped: sorted.filter((item) => item.status === 'SKIPPED').length,
    },
    results: sorted,
  }

  writeJson(outPath, summary)
  console.log(`Obsolete function smoke results written to ${outPath}`)
}

run()
