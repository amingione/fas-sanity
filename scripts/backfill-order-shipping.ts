#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { createClient } from '@sanity/client'
import type { Handler, HandlerEvent } from '@netlify/functions'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false })
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in environment. Aborting.')
  process.exit(1)
}

async function fetchOrders(limit: number) {
  return sanity.fetch<
    Array<{
      _id: string
      orderNumber?: string
      stripeSessionId?: string
      packingSlipUrl?: string
      shippingCarrier?: string
      selectedService?: { serviceCode?: string; amount?: number }
    }>
  >(
    `*[_type == "order" && defined(stripeSessionId) && (!defined(selectedService) || !defined(selectedService.serviceCode) || !defined(packingSlipUrl) || !defined(shippingCarrier))] | order(_createdAt asc)[0...$limit]{
      _id,
      orderNumber,
      stripeSessionId,
      packingSlipUrl,
      shippingCarrier,
      selectedService
    }`,
    { limit }
  )
}

async function main() {
  const limitArg = Number(process.argv[2])
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 50

  const orders = await fetchOrders(limit)
  if (!orders.length) {
    console.log('No orders require backfill.')
    return
  }

  const { handler: reprocessHandler } = (await import('../netlify/functions/reprocessStripeSession')) as {
    handler: Handler
  }

  console.log(`Backfilling ${orders.length} orders…`)

  for (const order of orders) {
    const sessionId = order.stripeSessionId
    if (!sessionId) {
      console.warn(`Skipping ${order._id} (missing stripeSessionId)`)
      continue
    }

    try {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        body: JSON.stringify({id: sessionId, autoFulfill: false}),
        isBase64Encoded: false,
        rawUrl: 'http://localhost/.netlify/functions/reprocessStripeSession',
        rawQuery: '',
        path: '/.netlify/functions/reprocessStripeSession',
      }

      const response = await reprocessHandler(event, {} as any)
      if (!response) {
        console.warn(`⚠️ ${order.orderNumber || order._id} • session=${sessionId} • handler returned no response`)
        continue
      }

      const ok = response.statusCode >= 200 && response.statusCode < 300
      console.log(
        `${ok ? '✅' : '⚠️'} ${order.orderNumber || order._id} • session=${sessionId} • status=${response.statusCode}`
      )
      if (!ok && response.body) {
        console.log(response.body)
      }
    } catch (err) {
      console.error(`❌ Failed to reprocess ${order.orderNumber || order._id}`, err)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
