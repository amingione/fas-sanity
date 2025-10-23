#!/usr/bin/env node

const {spawn} = require('node:child_process')

const token =
  process.env.SANITY_AUTH_TOKEN ||
  process.env.SANITY_DEPLOY_TOKEN ||
  process.env.SANITY_WRITE_TOKEN

if (!token) {
  console.log(
    '[sanity] Skipping `sanity schema deploy` – set SANITY_AUTH_TOKEN (or SANITY_DEPLOY_TOKEN / SANITY_WRITE_TOKEN) to enable this step in CI.',
  )
  process.exit(0)
}

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const args = [
  'exec',
  'sanity',
  'schema',
  'deploy',
  '--non-interactive',
  '--manifest-dir',
  './dist/static',
]

const child = spawn(pnpmCmd, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SANITY_AUTH_TOKEN: token,
  },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

child.on('error', (err) => {
  console.error('[sanity] Failed to run schema deploy', err)
  process.exit(1)
})
