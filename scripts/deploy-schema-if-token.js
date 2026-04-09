#!/usr/bin/env node
const dotenv = require('dotenv')
dotenv.config()


const {spawn} = require('node:child_process')

const tokenEnvKeys = [
  'SANITY_API_TOKEN',
  'SANITY_DEPLOY_TOKEN',
  'SANITY_AUTH_TOKEN',
  'SANITY_STUDIO_API_TOKEN',
  'SANITY_WRITE_TOKEN',
]

const resolveToken = () => {
  for (const key of tokenEnvKeys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return {token: value, source: key}
    }
  }

  return {token: '', source: undefined}
}

const tokenResolution = resolveToken()
const token = tokenResolution.token

if (!token) {
  const populatedKeys = tokenEnvKeys.filter((key) => {
    const value = process.env[key]
    return typeof value === 'string' && value.trim().length > 0
  })

  console.log(
    '[sanity] Skipping `sanity schema deploy` – set SANITY_API_TOKEN (preferred) or SANITY_DEPLOY_TOKEN/SANITY_AUTH_TOKEN to enable this step in CI.',
  )
  console.log(
    `[sanity] Token env check (names only): ${populatedKeys.length ? populatedKeys.join(', ') : 'none set'}.`,
  )
  process.exit(0)
}

if (tokenResolution.source && tokenResolution.source !== 'SANITY_API_TOKEN') {
  console.log(
    `[sanity] Using ${tokenResolution.source} for schema deploy (SANITY_API_TOKEN is preferred).`,
  )
}

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const args = [
  'exec',
  'sanity',
  'schema',
  'deploy',
  '--non-interactive',
]

const child = spawn(pnpmCmd, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SANITY_API_TOKEN: token,
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

child.on('error', (err) => {
  console.error('[sanity] Failed to run schema deploy', err)
  process.exit(1)
})
