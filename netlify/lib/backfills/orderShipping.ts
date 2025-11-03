import {createClient, type SanityClient} from '@sanity/client'
import type {Handler, HandlerEvent} from '@netlify/functions'

export type OrderShippingBackfillOptions = {
  limit?: number
  dryRun?: boolean
  orderId?: string
  sessionId?: string
  logger?: (message: string) => void
}

export type OrderShippingBackfillResult = {
  total: number
  processed: number
  skipped: number
  dryRun: boolean
  limit: number
  failures: number
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  stripeSessionId?: string
  packingSlipUrl?: string
  shippingCarrier?: string
  selectedService?: {serviceCode?: string; amount?: number}
}

function createSanityClient(): SanityClient {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    ''
  const dataset =
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    'production'
  const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

  if (!projectId || !dataset || !token) {
    throw new Error(
      'Missing Sanity configuration (SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN).'
    )
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-04-10',
    token,
    useCdn: false,
  })
}

async function importReprocessHandler(): Promise<Handler> {
  const mod = (await import('../../functions/reprocessStripeSession')) as {handler: Handler}
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

async function fetchOrders(
  sanity: SanityClient,
  options: OrderShippingBackfillOptions
): Promise<OrderDoc[]> {
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 50
  const conditions = [
    '_type == "order"',
    'defined(stripeSessionId)',
    '(!defined(selectedService) || !defined(selectedService.serviceCode) || !defined(packingSlipUrl) || !defined(shippingCarrier))',
  ]
  const params: Record<string, unknown> = {limit}

  if (options.sessionId) {
    conditions.push('stripeSessionId == $sessionId')
    params.sessionId = options.sessionId.trim()
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
    packingSlipUrl,
    shippingCarrier,
    selectedService
  }`

  return sanity.fetch<OrderDoc[]>(query, params)
}

export async function runOrderShippingBackfill(
  rawOptions: OrderShippingBackfillOptions = {}
): Promise<OrderShippingBackfillResult> {
  const options: OrderShippingBackfillOptions = {
    dryRun: Boolean(rawOptions.dryRun),
    limit: rawOptions.limit,
    orderId: rawOptions.orderId?.trim(),
    sessionId: rawOptions.sessionId?.trim(),
    logger: rawOptions.logger,
  }

  const sanity = createSanityClient()
  const orders = await fetchOrders(sanity, options)
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 50

  if (!orders.length) {
    options.logger?.('No orders require backfill.')
    return {dryRun: Boolean(options.dryRun), processed: 0, skipped: 0, failures: 0, total: 0, limit}
  }

  options.logger?.(`Backfilling ${orders.length} orders…`)

  const handler = options.dryRun ? null : await importReprocessHandler()
  let processed = 0
  let skipped = 0
  let failures = 0

  const maxConcurrencyEnv = Number(process.env.BACKFILL_ORDER_SHIPPING_CONCURRENCY)
  const maxConcurrency = Number.isFinite(maxConcurrencyEnv) && maxConcurrencyEnv > 0
    ? Math.floor(maxConcurrencyEnv)
    : 4
  const concurrency = Math.min(maxConcurrency, orders.length)

  const processOrder = async (order: OrderDoc) => {
    const sessionId = order.stripeSessionId?.trim()
    const label = order.orderNumber || order._id
    if (!sessionId) {
      skipped += 1
      options.logger?.(`Skipping ${label} (missing stripeSessionId)`)
      return
    }

    if (options.dryRun) {
      processed += 1
      options.logger?.(`[dry-run] Would reprocess ${label} (session ${sessionId}).`)
      return
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

      const response = await handler!(event, {} as any)
      if (!response) {
        failures += 1
        options.logger?.(`⚠️ ${label} • session=${sessionId} • handler returned no response`)
        return
      }

      const ok = response.statusCode >= 200 && response.statusCode < 300
      options.logger?.(
        `${ok ? '✅' : '⚠️'} ${label} • session=${sessionId} • status=${response.statusCode}`
      )
      if (!ok) {
        failures += 1
        if (response.body) options.logger?.(response.body)
      } else {
        processed += 1
      }
    } catch (err) {
      failures += 1
      options.logger?.(`❌ Failed to reprocess ${label}: ${(err as any)?.message || err}`)
    }
  }

  if (concurrency <= 1) {
    for (const order of orders) {
      await processOrder(order)
    }
  } else {
    let index = 0
    const nextOrder = () => {
      if (index >= orders.length) return undefined
      const order = orders[index]
      index += 1
      return order
    }

    const workers = Array.from({length: concurrency}, async () => {
      while (true) {
        const order = nextOrder()
        if (!order) break
        await processOrder(order)
      }
    })

    await Promise.all(workers)
  }

  return {
    dryRun: Boolean(options.dryRun),
    processed,
    skipped,
    failures,
    total: orders.length,
    limit,
  }
}
