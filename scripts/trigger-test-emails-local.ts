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

type Args = Record<string, string | boolean>

const args: Args = {}
for (const rawArg of process.argv.slice(2)) {
  if (!rawArg.startsWith('--')) continue
  const trimmed = rawArg.slice(2)
  if (!trimmed) continue
  const [key, ...rest] = trimmed.split('=')
  const value = rest.length ? rest.join('=') : true
  args[key] = value
}

const functionsRaw =
  (args.functions as string) || process.env.TEST_EMAIL_FUNCTIONS || 'sendCustomerEmail'
const functionNames = functionsRaw.split(',').map((fn) => fn.trim()).filter(Boolean)
const to =
  (args.to as string) ||
  process.env.TEST_EMAIL_TO ||
  process.env.RESEND_TEST_TO ||
  process.env.TEST_EMAIL

if (!to) {
  console.error(
    'Missing recipient. Set --to=you@example.com or TEST_EMAIL_TO/RESEND_TEST_TO in env.',
  )
  process.exit(1)
}

const vendorTemplate =
  (args['vendor-template'] as string) || process.env.TEST_VENDOR_TEMPLATE || 'welcome'
const campaignId = (args['campaign-id'] as string) || process.env.TEST_EMAIL_CAMPAIGN_ID
const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'
const authHeader =
  (args.auth as string) ||
  (process.env.BACKFILL_SECRET ? `Bearer ${process.env.BACKFILL_SECRET}` : undefined)

const buildPayload = (functionName: string) => {
  switch (functionName) {
    case 'sendCustomerEmail':
      return {
        to,
        subject: `Test email (${new Date().toISOString()})`,
        message: 'This is a test email triggered by trigger-test-emails-local.ts.',
        template: 'custom',
        dryRun,
      }
    case 'sendVendorEmail':
      return {
        to,
        template: vendorTemplate,
        data: {
          companyName: 'Test Vendor Co',
          contactName: 'Test Contact',
          pricingTier: 'Standard',
          paymentTerms: 'Net 30',
          creditLimit: 2500,
          portalEnabled: true,
          vendorPortalUrl: 'https://fasmotorsports.com/wholesale',
        },
        dryRun,
      }
    case 'sendEmail':
      return {
        email: to,
        name: 'Test User',
        message: 'Test email from sendEmail function.',
        dryRun,
      }
    case 'send-email-test':
      if (!campaignId) {
        throw new Error('send-email-test requires --campaign-id or TEST_EMAIL_CAMPAIGN_ID')
      }
      return {campaignId, dryRun}
    default:
      return {to, dryRun}
  }
}

async function resolveHandler(functionName: string): Promise<Handler> {
  const tsPath = path.resolve(process.cwd(), 'netlify/functions', `${functionName}.ts`)
  const jsPath = path.resolve(process.cwd(), 'netlify/functions', `${functionName}.js`)

  const module = await import(tsPath).catch(async () => import(jsPath))
  const handler: Handler | undefined = (module as any)?.handler || (module as any)?.default
  if (typeof handler !== 'function') {
    throw new Error(`Function "${functionName}" does not export a Netlify handler.`)
  }
  return handler
}

const buildEvent = (functionName: string, payload: Record<string, unknown>): HandlerEvent => {
  const headers: Record<string, string> = {'Content-Type': 'application/json'}
  if (authHeader) {
    headers.Authorization = authHeader
    headers.authorization = authHeader
  }

  return {
    httpMethod: 'POST',
    headers,
    multiValueHeaders: {},
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    body: JSON.stringify(payload),
    isBase64Encoded: false,
    rawUrl: `http://localhost/.netlify/functions/${functionName}`,
    rawQuery: '',
    path: `/.netlify/functions/${functionName}`,
  }
}

const context: HandlerContext = {
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
  functionName: 'local',
}

async function main() {
  for (const functionName of functionNames) {
    let payload: Record<string, unknown>
    try {
      payload = buildPayload(functionName)
    } catch (error) {
      console.error(`Skipping ${functionName}:`, error instanceof Error ? error.message : error)
      continue
    }

    try {
      const handler = await resolveHandler(functionName)
      const event = buildEvent(functionName, payload)
      const response = await handler(event, context)

      console.log(`\n→ ${functionName} (local invocation)`)
      console.log(`status: ${response?.statusCode ?? 'n/a'}`)
      if (response?.body) {
        console.log(response.body)
      }
    } catch (error) {
      console.error(`\n→ ${functionName} (local invocation failed)`)
      console.error(error)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
