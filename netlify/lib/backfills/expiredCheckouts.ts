import Stripe from 'stripe'
import type {Handler, HandlerEvent} from '@netlify/functions'

export type ExpiredCheckoutBackfillOptions = {
  dryRun?: boolean
  limit?: number
  since?: number | string | Date
  sessionId?: string
  logger?: (message: string) => void
}

export type ExpiredCheckoutBackfillResult = {
  dryRun: boolean
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

const DEFAULT_LIMIT = 50
const MAX_PAGE_SIZE = 100

const createStripeClient = (): Stripe => {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY in environment.')
  return new Stripe(key, {
    apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
  })
}

const toUnixSeconds = (value?: number | string | Date): number | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Math.floor(value.getTime() / 1000)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return toUnixSeconds(parsed)
    const date = new Date(trimmed)
    if (Number.isFinite(date.getTime())) return Math.floor(date.getTime() / 1000)
  }
  return undefined
}

async function importReprocessHandler(): Promise<Handler> {
  const mod = (await import('../../functions/reprocessStripeSession')) as {handler: Handler}
  if (typeof mod.handler !== 'function') {
    throw new Error('reprocessStripeSession handler not found.')
  }
  return mod.handler
}

type Target = {
  sessionId: string
  created: number | null
  eventId?: string
}

async function collectExpiredSessions(
  stripe: Stripe,
  options: ExpiredCheckoutBackfillOptions,
): Promise<Target[]> {
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : DEFAULT_LIMIT
  if (limit <= 0) return []

  if (options.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(options.sessionId)
    if ((session.status || '').toLowerCase() !== 'expired') {
      options.logger?.(
        `Skipping ${session.id}: status=${session.status || 'unknown'} is not "expired".`,
      )
      return []
    }
    return [{sessionId: session.id, created: session.created ?? null}]
  }

  const since = toUnixSeconds(options.since)
  const targets: Target[] = []
  let startingAfter: string | undefined

  while (targets.length < limit) {
    const pageSize = Math.min(MAX_PAGE_SIZE, limit - targets.length)
    const params: Stripe.EventListParams = {
      limit: pageSize,
      type: 'checkout.session.expired',
    }
    if (startingAfter) params.starting_after = startingAfter
    if (since) params.created = {gte: since}

    const page = await stripe.events.list(params)
    if (!page.data.length) break

    for (const event of page.data) {
      const session = event.data?.object as Stripe.Checkout.Session | undefined
      if (!session?.id) continue
      targets.push({
        sessionId: session.id,
        created: session.created ?? null,
        eventId: event.id,
      })
      if (targets.length >= limit) break
    }

    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) break
  }

  return targets
}

export async function runExpiredCheckoutBackfill(
  rawOptions: ExpiredCheckoutBackfillOptions = {},
): Promise<ExpiredCheckoutBackfillResult> {
  const options: ExpiredCheckoutBackfillOptions = {
    dryRun: Boolean(rawOptions.dryRun),
    limit: rawOptions.limit,
    since: rawOptions.since,
    sessionId: rawOptions.sessionId?.trim() || undefined,
    logger: rawOptions.logger,
  }

  const stripe = createStripeClient()
  const targets = await collectExpiredSessions(stripe, options)
  if (!targets.length) {
    options.logger?.('No expired checkout sessions matched the criteria.')
    return {
      dryRun: Boolean(options.dryRun),
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    }
  }

  options.logger?.(`Found ${targets.length} expired session(s) to process.`)

  if (options.dryRun) {
    for (const target of targets) {
      options.logger?.(
        `[dry-run] ${target.sessionId}${
          target.eventId ? ` (event ${target.eventId})` : ''
        } created=${target.created ?? 'unknown'}`,
      )
    }
    options.logger?.('Dry run complete.')
    return {
      dryRun: true,
      total: targets.length,
      processed: targets.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    }
  }

  const handler = await importReprocessHandler()
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const target of targets) {
    try {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        body: JSON.stringify({id: target.sessionId, autoFulfill: false}),
        isBase64Encoded: false,
        rawUrl: 'http://localhost/.netlify/functions/reprocessStripeSession',
        rawQuery: '',
        path: '/.netlify/functions/reprocessStripeSession',
      }
      const response = await handler(event, {} as any)
      const ok = response?.statusCode && response.statusCode >= 200 && response.statusCode < 300
      if (ok) {
        succeeded += 1
        options.logger?.(`✅ ${target.sessionId} • status=${response!.statusCode}`)
      } else {
        failed += 1
        options.logger?.(
          `⚠️ ${target.sessionId} • status=${response?.statusCode ?? 'n/a'}${
            target.eventId ? ` • event=${target.eventId}` : ''
          }`,
        )
        if (response?.body) options.logger?.(response.body)
      }
    } catch (err) {
      failed += 1
      options.logger?.(
        `❌ ${target.sessionId} • ${(err as any)?.message || err}${
          target.eventId ? ` • event=${target.eventId}` : ''
        }`,
      )
    }
  }

  return {
    dryRun: false,
    total: targets.length,
    processed: succeeded + failed,
    succeeded,
    failed,
    skipped,
  }
}
