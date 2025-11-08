#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import type {Handler, HandlerContext, HandlerEvent} from '@netlify/functions'

const ENV_FILES = ['.env.local', '.env.development.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

const [, , functionName, payloadArg] = process.argv

if (!functionName) {
  console.error('Usage: pnpm tsx scripts/invoke-netlify-function.ts <functionName> [jsonPayload]')
  process.exit(1)
}

async function main() {
  const fnModule = await import(
    path.resolve(process.cwd(), 'netlify/functions', `${functionName}.ts`)
  ).catch(
    async () => import(path.resolve(process.cwd(), 'netlify/functions', `${functionName}.js`)),
  )

  const handler: Handler | undefined = (fnModule as any)?.handler || (fnModule as any)?.default

  if (typeof handler !== 'function') {
    console.error(`Function "${functionName}" does not export a Netlify handler.`)
    process.exit(1)
  }

  const bodyObject = payloadArg ? JSON.parse(payloadArg) : {}

  const headers: Record<string, string> = {'Content-Type': 'application/json'}
  if (process.env.BACKFILL_SECRET) {
    const token = `Bearer ${process.env.BACKFILL_SECRET}`
    headers.Authorization = token
    headers.authorization = token
  }

  const event: HandlerEvent = {
    httpMethod: 'POST',
    headers,
    multiValueHeaders: {},
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    body: JSON.stringify(bodyObject),
    isBase64Encoded: false,
    rawUrl: `http://localhost/.netlify/functions/${functionName}`,
    rawQuery: '',
    path: `/.netlify/functions/${functionName}`,
  }

  const context: HandlerContext = {
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

  const response = await handler(event, context)

  console.log(`status: ${response?.statusCode ?? 'n/a'}`)

  if (response?.body) {
    console.log(response.body)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
