#!/usr/bin/env tsx

import http from 'node:http'
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

const getArgValue = (key: string) => {
  const match = process.argv.slice(2).find((arg) => arg.startsWith(`--${key}=`))
  if (!match) return undefined
  return match.slice(key.length + 3)
}

const port = Number(getArgValue('port') || process.env.FUNCTIONS_PORT || 8888)
const prefix = '/.netlify/functions/'

const resolveHandler = async (name: string): Promise<Handler | null> => {
  const base = path.resolve(process.cwd(), 'netlify/functions')
  const candidates = [
    path.join(base, `${name}.ts`),
    path.join(base, `${name}.tsx`),
    path.join(base, `${name}.js`),
    path.join(base, `${name}.mjs`),
    path.join(base, name, 'index.ts'),
    path.join(base, name, 'index.tsx'),
    path.join(base, name, 'index.js'),
    path.join(base, name, 'index.mjs'),
  ]

  const target = candidates.find((candidate) => fs.existsSync(candidate))
  if (!target) return null

  const mod = await import(target)
  const handler: Handler | undefined = (mod as any)?.handler || (mod as any)?.default
  if (typeof handler !== 'function') return null
  return handler
}

const context: HandlerContext = {
  functionName: 'local',
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

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (!requestUrl.pathname.startsWith(prefix)) {
    res.statusCode = 404
    res.end('Function not found...')
    return
  }

  const functionName = requestUrl.pathname.slice(prefix.length).split('/')[0]
  if (!functionName) {
    res.statusCode = 404
    res.end('Function not found...')
    return
  }

  const chunks: Buffer[] = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', async () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value
      if (Array.isArray(value)) headers[key] = value.join(', ')
    }

    const event: HandlerEvent = {
      httpMethod: req.method || 'GET',
      headers,
      multiValueHeaders: {},
      queryStringParameters: Object.fromEntries(requestUrl.searchParams.entries()),
      multiValueQueryStringParameters: {},
      body: body || null,
      isBase64Encoded: false,
      rawUrl: requestUrl.toString(),
      rawQuery: requestUrl.search.replace(/^\?/, ''),
      path: requestUrl.pathname,
    }

    let handler: Handler | null = null
    try {
      handler = await resolveHandler(functionName)
    } catch (error) {
      res.statusCode = 500
      res.end('Failed to load function.')
      console.error(error)
      return
    }

    if (!handler) {
      res.statusCode = 404
      res.end('Function not found...')
      return
    }

    try {
      const response = await handler(event, context)
      res.statusCode = response?.statusCode ?? 200
      if (response?.headers) {
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') res.setHeader(key, value)
        }
      }
      res.end(response?.body ?? '')
    } catch (error) {
      res.statusCode = 500
      res.end('Function error.')
      console.error(error)
    }
  })
})

server.listen(port, () => {
  console.log(`Local functions server ready: http://localhost:${port}`)
})
