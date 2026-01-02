#!/usr/bin/env tsx

import {spawn} from 'node:child_process'

const args = process.argv.slice(2)

const env = {...process.env}
delete env.NODE_OPTIONS
delete env.NETLIFY_AUTH_TOKEN

const child = spawn(
  'netlify',
  ['functions:serve', '--functions', 'netlify/functions', '--port', '8888', ...args],
  {stdio: 'inherit', env},
)

child.on('close', (code, signal) => {
  if (signal) {
    process.exit(1)
  }
  process.exit(code ?? 1)
})
