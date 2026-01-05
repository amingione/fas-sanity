import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

import {serializeSecrets} from '../infra/src/secrets/serializeSecrets'

const envPath = process.argv[2] ?? '.env'
const absolutePath = path.resolve(process.cwd(), envPath)

if (!fs.existsSync(absolutePath)) {
  throw new Error(`Env file not found: ${absolutePath}`)
}

const envRaw = fs.readFileSync(absolutePath, 'utf8')
const parsed = dotenv.parse(envRaw)

process.stdout.write(serializeSecrets(parsed))
