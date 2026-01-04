#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import dotenv from 'dotenv'
import type {Handler, HandlerContext, HandlerEvent} from '@netlify/functions'

const ENV_FILES = ['.env.local', '.env.development.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

type PayloadMap = Record<string, unknown>
type HeadersMap = Record<string, string>
type QueryMap = Record<string, string>

type FunctionConfig = {
  payload?: unknown
  headers?: HeadersMap
  query?: QueryMap
  method?: string
  okStatuses?: number[]
  okStatusRanges?: string[]
  requiredEnv?: string[]
  sideEffect?: boolean
  skip?: boolean
}

type TestConfig = {
  defaults?: FunctionConfig
  functions?: Record<string, FunctionConfig>
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue
    const trimmed = raw.slice(2)
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) {
      args.set(trimmed, 'true')
    } else {
      args.set(trimmed.slice(0, eqIndex), trimmed.slice(eqIndex + 1))
    }
  }
  return args
}

function resolvePayloadMap(filePath?: string): PayloadMap {
  if (!filePath) return {}
  const raw = readJsonFile(filePath)
  return raw as PayloadMap
}

function parseList(list?: string) {
  if (!list) return new Set<string>()
  return new Set(list.split(',').map((entry) => entry.trim()).filter(Boolean))
}

function readJsonFile(filePath: string) {
  const resolved = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`JSON file not found: ${filePath}`)
  }
  const raw = fs.readFileSync(resolved, 'utf8')
  return JSON.parse(raw)
}

function resolveConfig(filePath?: string): TestConfig {
  if (filePath) {
    return readJsonFile(filePath) as TestConfig
  }
  const defaultPath = path.resolve(process.cwd(), 'scripts', 'netlify-functions-test.config.json')
  if (fs.existsSync(defaultPath)) {
    return readJsonFile(defaultPath) as TestConfig
  }
  return {}
}

function getFunctionFiles(functionsDir: string) {
  const entries = fs.readdirSync(functionsDir)
  return entries
    .filter((name) => !name.startsWith('_'))
    .filter((name) => !name.endsWith('.zip'))
    .filter((name) => !name.endsWith('.map'))
    .filter((name) => name !== 'manifest.json')
    .filter((name) => {
      const fullPath = path.join(functionsDir, name)
      if (!fs.statSync(fullPath).isFile()) return false
      return /\.(ts|tsx|js|mjs|cjs)$/.test(name)
    })
}

function hasHandlerExport(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, 'utf8')
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+handler\b/,
    /\bexport\s+const\s+handler\b/,
    /\bexport\s*\{\s*handler\s*\}/,
    /\bexports\.handler\b/,
    /\bmodule\.exports\.handler\b/,
  ]
  return patterns.some((pattern) => pattern.test(raw))
}

function applyEnvPlaceholders(headers: HeadersMap) {
  const resolved: HeadersMap = {}
  for (const [key, value] of Object.entries(headers)) {
    const trimmed = value.trim()
    const envMatch = trimmed.match(/^\$ENV:([A-Z0-9_]+)$/) || trimmed.match(/^\$\{ENV:([A-Z0-9_]+)\}$/)
    if (envMatch) {
      resolved[key] = process.env[envMatch[1]] || ''
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

function buildQueryString(query: QueryMap) {
  return Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function createEvent(
  functionName: string,
  body: unknown,
  method: string,
  headers: HeadersMap,
  query: QueryMap,
): HandlerEvent {
  const eventHeaders: HeadersMap = {...headers}
  if (process.env.BACKFILL_SECRET) {
    const token = `Bearer ${process.env.BACKFILL_SECRET}`
    eventHeaders.Authorization = token
    eventHeaders.authorization = token
  }

  const rawQuery = buildQueryString(query)
  return {
    httpMethod: method,
    headers: eventHeaders,
    multiValueHeaders: {},
    queryStringParameters: query,
    multiValueQueryStringParameters: {},
    body: method === 'GET' ? null : JSON.stringify(body ?? {}),
    isBase64Encoded: false,
    rawUrl: `http://localhost/.netlify/functions/${functionName}`,
    rawQuery,
    path: `/.netlify/functions/${functionName}`,
  }
}

function createContext(functionName: string): HandlerContext {
  return {
    functionName,
    functionVersion: 'local',
    getRemainingTimeInMillis: () => 30000,
    callbackWaitsForEmptyEventLoop: false,
    done: () => undefined,
    fail: () => undefined,
    succeed: () => undefined,
    clientContext: undefined,
    identity: undefined,
    invokedFunctionArn: '',
    awsRequestId: 'local',
    logGroupName: 'local',
    logStreamName: 'local',
    memoryLimitInMB: '1024',
  }
}

function mergeRecords<T extends Record<string, string>>(base: T | undefined, extra: T | undefined) {
  return {...(base || {}), ...(extra || {})}
}

function parseOkRange(range: string) {
  const trimmed = range.trim().toLowerCase()
  if (trimmed.length !== 3 || trimmed[1] !== 'x' || trimmed[2] !== 'x') return null
  const prefix = Number.parseInt(trimmed[0], 10)
  if (!Number.isFinite(prefix)) return null
  return {min: prefix * 100, max: prefix * 100 + 99}
}

function isStatusOk(
  status: number | undefined,
  okStatuses: number[] | undefined,
  okRanges: string[] | undefined,
) {
  if (!Number.isFinite(status)) return false
  if (okStatuses && okStatuses.length > 0) {
    return okStatuses.includes(status as number)
  }
  const ranges = okRanges && okRanges.length > 0 ? okRanges : ['2xx']
  return ranges.some((range) => {
    const parsed = parseOkRange(range)
    if (!parsed) return false
    return (status as number) >= parsed.min && (status as number) <= parsed.max
  })
}

function resolvePayload(
  functionName: string,
  defaults: FunctionConfig,
  fnConfig: FunctionConfig,
  payloads: PayloadMap,
  payloadAll: unknown,
) {
  const basePayload = defaults.payload ?? {}
  const configuredPayload = fnConfig.payload ?? basePayload
  const payloadFromMap = functionName in payloads ? payloads[functionName] : configuredPayload
  return payloadAll ?? payloadFromMap
}

function captureConsole() {
  const logs: string[] = []
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }
  const wrap = (level: string) => (...args: unknown[]) => {
    logs.push(`[${level}] ${util.format(...args)}`)
  }
  console.log = wrap('log')
  console.info = wrap('info')
  console.warn = wrap('warn')
  console.error = wrap('error')
  return {
    logs,
    restore: () => {
      console.log = original.log
      console.info = original.info
      console.warn = original.warn
      console.error = original.error
    },
  }
}

function detectBlockedReason(bodyText: string) {
  const checks = [
    'Missing required environment variables',
    'not configured',
    'Missing RESEND_API_KEY',
    'Stripe secret key not configured',
    'Sanity credentials are not configured',
  ]
  return checks.find((snippet) => bodyText.includes(snippet))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const only = parseList(args.get('only'))
  const skip = parseList(args.get('skip'))
  const methodOverride = args.get('method') ? args.get('method')!.toUpperCase() : undefined
  const showLogs = args.get('show-logs') === 'true'
  const allowSideEffects = args.get('allow-side-effects') === 'true'
  const payloadAll = args.get('payload') ? JSON.parse(args.get('payload') as string) : undefined
  const payloads = resolvePayloadMap(args.get('payloads'))
  const config = resolveConfig(args.get('config'))
  const defaults = config.defaults || {}

  const functionsDir = path.resolve(process.cwd(), 'netlify', 'functions')
  const functionFiles = getFunctionFiles(functionsDir)

  const results: Array<{
    name: string
    status?: number
    outcome: 'ok' | 'fail' | 'error' | 'blocked' | 'skipped'
    message?: string
    logs?: string[]
  }> = []

  for (const file of functionFiles) {
    const functionName = path.basename(file, path.extname(file))
    if (only.size && !only.has(functionName)) continue
    if (skip.has(functionName)) continue

    const fnConfig = config.functions?.[functionName] || {}
    if (fnConfig.skip) {
      results.push({name: functionName, outcome: 'skipped', message: 'Skipped by config'})
      continue
    }
    if (fnConfig.sideEffect && !allowSideEffects) {
      results.push({
        name: functionName,
        outcome: 'blocked',
        message: 'Side-effect function skipped (use --allow-side-effects=true)',
      })
      continue
    }
    if (fnConfig.requiredEnv && fnConfig.requiredEnv.length > 0) {
      const missingEnv = fnConfig.requiredEnv.filter((key) => !process.env[key])
      if (missingEnv.length > 0) {
        results.push({
          name: functionName,
          outcome: 'blocked',
          message: `Missing env: ${missingEnv.join(', ')}`,
        })
        continue
      }
    }

    const modulePath = path.resolve(functionsDir, file)
    if (!hasHandlerExport(modulePath)) {
      results.push({
        name: functionName,
        outcome: 'skipped',
        message: 'No handler export found',
      })
      continue
    }

    const payload = resolvePayload(functionName, defaults, fnConfig, payloads, payloadAll)
    const method = methodOverride || fnConfig.method || defaults.method || 'POST'
    const mergedHeaders = mergeRecords(defaults.headers, fnConfig.headers)
    const headers = applyEnvPlaceholders(mergedHeaders)
    const query = mergeRecords(defaults.query, fnConfig.query)
    const okStatuses = fnConfig.okStatuses || defaults.okStatuses
    const okStatusRanges = fnConfig.okStatusRanges || defaults.okStatusRanges || ['2xx']

    try {
      const fnModule = await import(modulePath)
      const handler: Handler | undefined = fnModule?.handler || fnModule?.default
      if (typeof handler !== 'function') {
        results.push({
          name: functionName,
          outcome: 'skipped',
          message: 'No handler export found',
        })
        continue
      }

      const event = createEvent(functionName, payload, method, headers, query)
      const context = createContext(functionName)
      const consoleCapture = captureConsole()
      let response
      try {
        response = await handler(event, context)
      } finally {
        consoleCapture.restore()
      }
      const statusCode = typeof response?.statusCode === 'number' ? response.statusCode : undefined
      const responseBody = typeof response?.body === 'string' ? response.body : ''
      const blockedReason =
        statusCode && statusCode >= 500 ? detectBlockedReason(responseBody) : undefined
      const outcome = blockedReason
        ? 'blocked'
        : isStatusOk(statusCode, okStatuses, okStatusRanges)
          ? 'ok'
          : 'fail'
      results.push({
        name: functionName,
        status: statusCode,
        outcome,
        message: blockedReason,
        logs: consoleCapture.logs,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({name: functionName, outcome: 'error', message})
    }
  }

  const counts = results.reduce(
    (acc, result) => {
      acc[result.outcome] += 1
      return acc
    },
    {ok: 0, fail: 0, error: 0, blocked: 0, skipped: 0},
  )

  for (const result of results) {
    const status = result.status !== undefined ? ` status=${result.status}` : ''
    const message = result.message ? ` message="${result.message}"` : ''
    console.log(`[${result.outcome}] ${result.name}${status}${message}`)
    const shouldShowLogs =
      showLogs || (result.outcome !== 'ok' && result.logs && result.logs.length > 0)
    if (shouldShowLogs && result.logs) {
      for (const line of result.logs) {
        console.log(`  log: ${line}`)
      }
    }
  }

  console.log(
    `Summary: ok=${counts.ok} fail=${counts.fail} error=${counts.error} blocked=${counts.blocked} skipped=${counts.skipped} total=${results.length}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
