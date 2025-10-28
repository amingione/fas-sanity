import {createClient, type SanityClient} from '@sanity/client'
import type {Handler, HandlerEvent} from '@netlify/functions'

export type StripeBackfillKind = 'checkout' | 'paymentIntent' | 'charge'

export type OrderStripeBackfillOptions = {
  kind: StripeBackfillKind
  limit?: number
  dryRun?: boolean
  id?: string
  logger?: (message: string) => void
}

export type OrderStripeBackfillResult = {
  dryRun: boolean
  kind: StripeBackfillKind
  total: number
  processed: number
  succeeded: number
  failed: number
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  stripeSessionId?: string
  paymentIntentId?: string
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

const ORDER_QUERIES: Record<StripeBackfillKind, string> = {
  checkout: `*[
    _type == "order" &&
    defined(stripeSessionId) &&
    (
      !defined(stripeCheckoutStatus) ||
      stripeCheckoutStatus == "" ||
      !defined(stripeCreatedAt) ||
      !defined(totalAmount)
    )
  ] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`,
  paymentIntent: `*[
    _type == "order" &&
    defined(stripeSessionId) &&
    (
      !defined(paymentIntentId) ||
      paymentIntentId == "" ||
      !defined(stripePaymentIntentStatus) ||
      stripePaymentIntentStatus == ""
    )
  ] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`,
  charge: `*[
    _type == "order" &&
    defined(stripeSessionId) &&
    (
      !defined(chargeId) ||
      chargeId == "" ||
      !defined(cardBrand) ||
      cardBrand == "" ||
      !defined(receiptUrl) ||
      receiptUrl == ""
    )
  ] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`,
}

function formatOrderRef(doc: OrderDoc): string {
  return doc.orderNumber ? `${doc.orderNumber} (${doc._id})` : doc._id
}

function selectStripeId(doc: OrderDoc, kind: StripeBackfillKind): string | null {
  if (kind === 'checkout') {
    return doc.stripeSessionId || null
  }
  if (kind === 'paymentIntent') {
    return doc.paymentIntentId || doc.stripeSessionId || null
  }
  return doc.paymentIntentId || doc.stripeSessionId || null
}

async function fetchOrders(
  sanity: SanityClient,
  kind: StripeBackfillKind,
  limit: number
): Promise<OrderDoc[]> {
  const query = ORDER_QUERIES[kind]
  if (!query) return []
  return sanity.fetch<OrderDoc[]>(query, {limit})
}

export async function runOrderStripeBackfill(
  rawOptions: OrderStripeBackfillOptions
): Promise<OrderStripeBackfillResult> {
  const kind = rawOptions.kind
  if (!kind) {
    throw new Error('Missing required option "kind".')
  }

  const logger = rawOptions.logger
  const dryRun = Boolean(rawOptions.dryRun)
  const limit = rawOptions.limit && rawOptions.limit > 0 ? Math.floor(rawOptions.limit) : 25
  const sanity = createSanityClient()
  const handler = dryRun ? null : await importReprocessHandler()

  const targets: Array<{label: string; id: string}> = []

  if (rawOptions.id) {
    targets.push({label: rawOptions.id, id: rawOptions.id})
  } else {
    const docs = await fetchOrders(sanity, kind, limit)
    if (!docs.length) {
      logger?.('No orders require backfill for the selected type.')
      return {
        dryRun,
        kind,
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
      }
    }

    for (const doc of docs) {
      const id = selectStripeId(doc, kind)
      if (!id) {
        logger?.(`Skipping ${formatOrderRef(doc)} (missing Stripe identifier)`)
        continue
      }
      targets.push({label: formatOrderRef(doc), id})
    }
  }

  if (!targets.length) {
    logger?.('Nothing to process.')
    return {
      dryRun,
      kind,
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
    }
  }

  let succeeded = 0
  let failed = 0

  for (const target of targets) {
    if (dryRun) {
      logger?.(`[dry-run] Would reprocess ${target.label} via ${target.id}`)
      continue
    }

    try {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        body: JSON.stringify({id: target.id, autoFulfill: false}),
        isBase64Encoded: false,
        rawUrl: 'http://localhost/.netlify/functions/reprocessStripeSession',
        rawQuery: '',
        path: '/.netlify/functions/reprocessStripeSession',
      }

      const response = await handler!(event, {} as any)
      const ok = response?.statusCode && response.statusCode >= 200 && response.statusCode < 300
      if (ok) {
        succeeded += 1
        logger?.(`✅ ${target.label} • ${target.id} • status=${response!.statusCode}`)
      } else {
        failed += 1
        logger?.(`⚠️ ${target.label} • ${target.id} • status=${response?.statusCode ?? 'n/a'}`)
        if (response?.body) logger?.(response.body)
      }
    } catch (err) {
      failed += 1
      logger?.(`❌ ${target.label} • ${target.id} • ${(err as any)?.message || err}`)
    }
  }

  const processed = dryRun ? targets.length : succeeded + failed

  if (dryRun) {
    logger?.(`Dry run complete. ${targets.length} record(s) matched.`)
  } else {
    logger?.(
      `Done. ${succeeded} succeeded${failed ? `, ${failed} failed` : ''}${
        rawOptions.id ? '' : `, processed ${processed} records`
      }.`
    )
  }

  return {
    dryRun,
    kind,
    total: targets.length,
    processed,
    succeeded,
    failed,
  }
}
