#!/usr/bin/env node
const dotenv = require('dotenv')
dotenv.config()


const {spawn} = require('node:child_process')

const token = process.env.SANITY_API_TOKEN || process.env.SANITY_DEPLOY_TOKEN

if (!token) {
  console.log(
    '[sanity] Skipping `sanity schema deploy` – set SANITY_API_TOKEN (or SANITY_DEPLOY_TOKEN) to enable this step in CI.',
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
