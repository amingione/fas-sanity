#!/usr/bin/env node
import dotenv from 'dotenv'

dotenv.config()

const fs = require('fs/promises')
const path = require('path')

const SAMPLE_EVENT = {
  id: 'evt_test_webhook',
  object: 'event',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  data: {
    object: {
      id: 'cs_test_123',
      object: 'checkout.session',
      currency: 'usd',
      amount_total: 10000,
      payment_status: 'paid',
      status: 'complete',
      mode: 'payment',
      customer: 'cus_test_123',
      customer_details: {
        email: 'example@test.com',
        name: 'Webhook Tester',
        phone: null,
        address: {
          line1: '123 Test Street',
          line2: null,
          city: 'Austin',
          state: 'TX',
          postal_code: '73301',
          country: 'US',
        },
      },
      metadata: {},
    },
  },
}

async function loadPayload(inputPath) {
  if (!inputPath) return JSON.stringify(SAMPLE_EVENT)
  const absolutePath = path.resolve(process.cwd(), inputPath)
  return fs.readFile(absolutePath, 'utf8')
}

async function main() {
  const [, , inputPath] = process.argv
  const body = await loadPayload(inputPath)

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
  if (!handler) throw new Error('Unable to import stripeWebhook handler')

  const fakeSignature = 't=0,v1=fake'
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
    `Webhook test completed with status ${response.statusCode}. Body: ${response.body || ''}`,
  )
}

main().catch((err) => {
  console.error('test-webhook failed:', err)
  process.exit(1)
})
