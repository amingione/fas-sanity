#!/usr/bin/env tsx
// Backfill orders missing shipping/billing/card/weight metadata by reprocessing Stripe sessions.

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient, type SanityClient} from '@sanity/client'
import type {Handler, HandlerEvent} from '@netlify/functions'
import {requireSanityCredentials} from '../netlify/lib/sanityEnv'

type CliOptions = {
  limit?: number
  dryRun?: boolean
  orderId?: string
  sessionId?: string
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  stripeSessionId?: string
  paymentIntentId?: string
}

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit "${value}"`)
      options.limit = parsed
      i += 1
      continue
    }
    if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true
      continue
    }
    if (arg === '--order') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --order')
      options.orderId = value.trim()
      i += 1
      continue
    }
    if (arg === '--session') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --session')
      options.sessionId = value.trim()
      i += 1
      continue
    }
  }
  return options
}

function createSanityClient(): SanityClient {
  const {projectId, dataset, token} = requireSanityCredentials()
  return createClient({projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false})
}

async function importReprocessHandler(): Promise<Handler> {
  const mod = (await import('../netlify/functions/reprocessStripeSession')) as {handler: Handler}
  if (typeof mod.handler !== 'function') {
    throw new Error('reprocessStripeSession handler not found.')
  }
  return mod.handler
}

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

async function fetchOrders(sanity: SanityClient, options: CliOptions): Promise<OrderDoc[]> {
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 50
  const conditions = [
    '_type == "order"',
    '(defined(stripeSessionId) || defined(paymentIntentId))',
    '(' +
      [
        '!defined(shippingAddress.addressLine1)',
        '!defined(billingAddress.addressLine1)',
        '!defined(cardBrand) || cardBrand == ""',
        '!defined(cardLast4) || cardLast4 == ""',
        '!defined(receiptUrl) || receiptUrl == ""',
        '!defined(weight.value)',
        '!defined(dimensions.length)',
        '!defined(amountShipping)',
      ].join(' || ') +
      ')',
  ]

  const params: Record<string, unknown> = {limit}

  if (options.sessionId) {
    conditions.push('stripeSessionId == $sessionId')
    params.sessionId = options.sessionId
  } else if (options.orderId) {
    const normalized = normalizeSanityId(options.orderId)
    if (!normalized) return []
    conditions.push('_id in $orderIds')
    params.orderIds = [normalized, `drafts.${normalized}`]
  }

  const query = `*[${conditions.join(' && ')}] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`

  return sanity.fetch<OrderDoc[]>(query, params)
}

function describeOrder(order: OrderDoc): string {
  return order.orderNumber ? `${order.orderNumber} (${order._id})` : order._id
}

async function main() {
  const options = parseArgs()
  const sanity = createSanityClient()
  const orders = await fetchOrders(sanity, options)
  const dryRun = Boolean(options.dryRun)

  if (!orders.length) {
    console.log('No orders require backfill.')
    return
  }

  console.log(`Reprocessing ${orders.length} order(s)…${dryRun ? ' [dry-run]' : ''}`)
  const handler = dryRun ? null : await importReprocessHandler()
  let processed = 0
  let failed = 0
  let skipped = 0

  for (const order of orders) {
    const stripeId = order.stripeSessionId || order.paymentIntentId
    const label = describeOrder(order)
    if (!stripeId) {
      skipped += 1
      console.log(`Skipping ${label} (no stripeSessionId/paymentIntentId)`)
      continue
    }
    if (dryRun) {
      processed += 1
      console.log(`[dry-run] Would reprocess ${label} via ${stripeId}`)
      continue
    }
    try {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        body: JSON.stringify({id: stripeId, autoFulfill: false}),
        isBase64Encoded: false,
        rawUrl: 'http://localhost/.netlify/functions/reprocessStripeSession',
        rawQuery: '',
        path: '/.netlify/functions/reprocessStripeSession',
      }

      const response = await handler!(event, {} as any)
      const ok = response && response.statusCode >= 200 && response.statusCode < 300
      if (ok) {
        processed += 1
        console.log(`✅ ${label} • ${stripeId} • status=${response!.statusCode}`)
      } else {
        failed += 1
        console.log(`⚠️ ${label} • ${stripeId} • status=${response?.statusCode ?? 'n/a'}`)
        if (response?.body) console.log(response.body)
      }
    } catch (err: any) {
      failed += 1
      console.log(`❌ ${label} • ${stripeId} • ${err?.message || err}`)
    }
  }

  console.log(
    `Done. processed=${processed}, failed=${failed}${
      skipped ? `, skipped=${skipped}` : ''
    }, total=${orders.length}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
