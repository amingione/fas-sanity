#!/usr/bin/env node

const fs = require('fs/promises')
const path = require('path')

async function main() {
  const [, , inputPath] = process.argv
  if (!inputPath) {
    console.error('Usage: pnpm tsx scripts/stripe-maintenance/webhook-handler-fixed.js <event.json>')
    process.exit(1)
  }

  const absolutePath = path.resolve(process.cwd(), inputPath)
  const payloadRaw = await fs.readFile(absolutePath, 'utf8')
  const payload = payloadRaw.trim()
  const body = payload.startsWith('{') || payload.startsWith('[') ? payload : JSON.stringify(payload)

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_test'
  }
  process.env.STRIPE_WEBHOOK_NO_VERIFY = process.env.STRIPE_WEBHOOK_NO_VERIFY || '1'

  const handlerModule = await import('../../netlify/functions/stripeWebhook.ts')
  const handler =
    handlerModule.handler ||
    (typeof handlerModule.default === 'function'
      ? handlerModule.default
      : handlerModule.default?.handler)
  if (!handler) {
    throw new Error('Unable to load stripeWebhook handler')
  }

  const fakeSignature = process.env.STRIPE_SIGNATURE || 't=0,v1=fake'
  const response = await handler(
    {
      httpMethod: 'POST',
      headers: {'stripe-signature': fakeSignature},
      body,
      isBase64Encoded: false,
    },
    {},
  )

  console.log(
    JSON.stringify(
      {
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('Failed to execute webhook handler locally:', err)
  process.exit(1)
})
