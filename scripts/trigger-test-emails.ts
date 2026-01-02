#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

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

const baseUrlRaw =
  (args['base-url'] as string) || process.env.TEST_EMAIL_FUNCTIONS_URL || 'http://localhost:8888'
const baseUrl = baseUrlRaw.replace(/\/$/, '')
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

const buildPayload = (functionName: string) => {
  switch (functionName) {
    case 'sendCustomerEmail':
      return {
        to,
        subject: `Test email (${new Date().toISOString()})`,
        message: 'This is a test email triggered by trigger-test-emails.ts.',
        template: 'custom',
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
      }
    case 'sendEmail':
      return {
        email: to,
        name: 'Test User',
        message: 'Test email from sendEmail function.',
      }
    case 'send-email-test':
      if (!campaignId) {
        throw new Error('send-email-test requires --campaign-id or TEST_EMAIL_CAMPAIGN_ID')
      }
      return {campaignId}
    default:
      return {to}
  }
}

const buildUrl = (functionName: string) => {
  if (baseUrl.includes('/.netlify/functions')) {
    return `${baseUrl}/${functionName}`
  }
  return `${baseUrl}/.netlify/functions/${functionName}`
}

async function main() {
  for (const functionName of functionNames) {
    const url = buildUrl(functionName)
    let payload: Record<string, unknown>
    try {
      payload = buildPayload(functionName)
    } catch (error) {
      console.error(`Skipping ${functionName}:`, error instanceof Error ? error.message : error)
      continue
    }

    console.log(`\n→ ${functionName} @ ${url}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload),
    })
    const bodyText = await res.text()
    console.log(`status: ${res.status}`)
    if (bodyText) console.log(bodyText)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
