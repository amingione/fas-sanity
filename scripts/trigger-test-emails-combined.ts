#!/usr/bin/env tsx

import {spawn} from 'node:child_process'
import path from 'node:path'

type RunResult = {label: string; code: number | null; signal: NodeJS.Signals | null}

const args = process.argv.slice(2)

const getArgValue = (key: string) => {
  const match = args.find((arg) => arg.startsWith(`--${key}=`))
  if (!match) return undefined
  return match.slice(key.length + 3)
}

const resolveBaseUrl = () => {
  const fromArgs = getArgValue('base-url')
  const fromEnv = process.env.TEST_EMAIL_FUNCTIONS_URL
  const base = fromArgs || fromEnv || 'http://localhost:8888'
  return base.replace(/\/$/, '')
}

const isHttpAvailable = async (baseUrl: string) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 800)
  try {
    const res = await fetch(`${baseUrl}/.netlify/functions/email-health`, {
      method: 'GET',
      signal: controller.signal,
    })
    return Boolean(res)
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

const runScript = (label: string, scriptPath: string, scriptArgs: string[]) =>
  new Promise<RunResult>((resolve) => {
    const child = spawn('pnpm', ['tsx', scriptPath, ...scriptArgs], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('close', (code, signal) => resolve({label, code, signal}))
  })

const formatResult = (result: RunResult) => {
  if (result.signal) return `${result.label}: stopped (${result.signal})`
  if (result.code === 0) return `${result.label}: success`
  return `${result.label}: failed (exit ${result.code ?? 'unknown'})`
}

async function main() {
  const localScript = path.resolve(process.cwd(), 'scripts/trigger-test-emails-local.ts')
  const httpScript = path.resolve(process.cwd(), 'scripts/trigger-test-emails.ts')

  const localResult = await runScript('local', localScript, args)
  const baseUrl = resolveBaseUrl()
  const httpAvailable = await isHttpAvailable(baseUrl)
  const httpResult = httpAvailable
    ? await runScript('http', httpScript, args)
    : {label: 'http', code: 0, signal: null}

  console.log('\nTest summary')
  console.log('------------')
  console.log(formatResult(localResult))
  if (httpAvailable) {
    console.log(formatResult(httpResult))
  } else {
    console.log(`http: skipped (Netlify Dev not running at ${baseUrl})`)
  }

  const hasFailure =
    localResult.code !== 0 ||
    (httpAvailable && httpResult.code !== 0) ||
    Boolean(localResult.signal) ||
    (httpAvailable && Boolean(httpResult.signal))
  if (hasFailure) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
