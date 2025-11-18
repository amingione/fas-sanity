import Stripe from 'stripe'

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-08-27.basil'
const DAY_SECONDS = 60 * 60 * 24
const DAY_BUCKETS = 30
const DEFAULT_CHARGE_SCAN_LIMIT = getNumericEnv(
  'SANITY_STUDIO_STRIPE_ANALYTICS_CHARGE_LIMIT',
  5000,
)
const DEFAULT_SESSION_SCAN_LIMIT = getNumericEnv(
  'SANITY_STUDIO_STRIPE_ANALYTICS_SESSION_LIMIT',
  400,
)
const DEFAULT_TOP_PRODUCTS_WINDOW_DAYS = getNumericEnv(
  'SANITY_STUDIO_STRIPE_ANALYTICS_TOP_PRODUCTS_DAYS',
  90,
)

export type StripeAnalyticsSummary = {
  currency: string
  totalSalesAllTime: number
  totalSales30d: number
  totalOrders: number
  refundCount: number
  refundTotal: number
  averageOrderValue: number
}

export type StripeAnalyticsChartPoint = {
  date: string
  total: number
}

export type StripeAnalyticsProductRow = {
  name: string
  revenue: number
  unitsSold: number
}

export type StripeAnalyticsPayload = {
  summary: StripeAnalyticsSummary
  salesByDay: StripeAnalyticsChartPoint[]
  topProducts: StripeAnalyticsProductRow[]
  generatedAt: string
  rangeStart: string
  rangeEnd: string
}

export async function fetchStripeAnalytics(): Promise<StripeAnalyticsPayload> {
  const stripe = requireStripeClient()
  const now = Math.floor(Date.now() / 1000)
  const todayStart = startOfDayUnix(now)
  const rangeStart = todayStart - (DAY_BUCKETS - 1) * DAY_SECONDS

  const dayBuckets = seedDayBuckets(rangeStart, DAY_BUCKETS)
  let totalSalesAllTime = 0
  let totalSales30d = 0
  let totalOrders = 0
  let refundCount = 0
  let refundTotal = 0
  let currency: string | null = null
  let inspectedCharges = 0
  const chargeIterator = stripe.charges.list({
    limit: 100,
    expand: ['data.refunds'],
  }) as Stripe.ApiListPromise<Stripe.Charge>

  try {
    for await (const charge of chargeIterator) {
      if (!charge?.paid || charge.status !== 'succeeded') {
        continue
      }
      const amountCaptured = charge.amount_captured ?? charge.amount ?? 0
      totalSalesAllTime += amountCaptured
      totalOrders += 1
      if (!currency && charge.currency) {
        currency = charge.currency
      }

      if (charge.created >= rangeStart) {
        totalSales30d += amountCaptured
        const bucket = bucketKey(charge.created)
        if (bucket && dayBuckets.has(bucket)) {
          dayBuckets.set(bucket, (dayBuckets.get(bucket) || 0) + amountCaptured)
        }
      }

      if ((charge.amount_refunded || 0) > 0) {
        const refundEntries: Array<Pick<Stripe.Refund, 'amount'>> =
          charge.refunds?.data && charge.refunds.data.length > 0
            ? charge.refunds.data
            : charge.amount_refunded
              ? [{amount: charge.amount_refunded}]
              : []
        for (const refund of refundEntries) {
          if (!refund?.amount) continue
          refundTotal += refund.amount
          refundCount += 1
        }
      }

      inspectedCharges += 1
      if (inspectedCharges >= DEFAULT_CHARGE_SCAN_LIMIT) {
        break
      }
    }
  } catch (err) {
    console.error('stripe-analytics: failed to iterate charges', err)
  }

  const chart: StripeAnalyticsChartPoint[] = Array.from(dayBuckets.entries()).map(
    ([date, cents]) => ({
      date,
      total: centsToAmount(cents),
    }),
  )

  const summary: StripeAnalyticsSummary = {
    currency: (currency || 'usd').toUpperCase(),
    totalSalesAllTime: centsToAmount(totalSalesAllTime),
    totalSales30d: centsToAmount(totalSales30d),
    totalOrders,
    refundCount,
    refundTotal: centsToAmount(refundTotal),
    averageOrderValue: totalOrders ? centsToAmount(totalSalesAllTime / totalOrders) : 0,
  }

  const topProducts = await collectTopProducts(stripe, now)

  return {
    summary,
    salesByDay: chart,
    topProducts,
    generatedAt: new Date().toISOString(),
    rangeStart: new Date(rangeStart * 1000).toISOString(),
    rangeEnd: new Date(now * 1000).toISOString(),
  }
}

function requireStripeClient(): Stripe {
  const secret =
    process.env.STRIPE_SECRET_KEY ||
    process.env.SANITY_STUDIO_STRIPE_SECRET_KEY ||
    process.env.VITE_STRIPE_SECRET_KEY

  if (!secret) {
    throw new Error('Stripe analytics unavailable: missing STRIPE_SECRET_KEY')
  }

  return new Stripe(secret, {apiVersion: STRIPE_API_VERSION})
}

function centsToAmount(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return Number((cents / 100).toFixed(2))
}

function startOfDayUnix(timestampSec: number): number {
  const date = new Date(timestampSec * 1000)
  date.setUTCHours(0, 0, 0, 0)
  return Math.floor(date.getTime() / 1000)
}

function seedDayBuckets(start: number, days: number): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < days; i += 1) {
    const date = new Date((start + i * DAY_SECONDS) * 1000)
    map.set(date.toISOString().slice(0, 10), 0)
  }
  return map
}

function bucketKey(timestampSec: number): string {
  const date = new Date(timestampSec * 1000)
  return date.toISOString().slice(0, 10)
}

function getNumericEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

async function collectTopProducts(
  stripe: Stripe,
  now: number,
): Promise<StripeAnalyticsProductRow[]> {
  const lookbackSeconds = Math.max(1, DEFAULT_TOP_PRODUCTS_WINDOW_DAYS) * DAY_SECONDS
  const since = now - lookbackSeconds
  const aggregates = new Map<
    string,
    {
      name: string
      total: number
      units: number
    }
  >()

  try {
    const sessionIterator = stripe.checkout.sessions.list({
      limit: 100,
      status: 'complete',
      created: {gte: since},
      expand: ['data.line_items'],
    }) as Stripe.ApiListPromise<Stripe.Checkout.Session>

    let inspectedSessions = 0
    for await (const session of sessionIterator) {
      const items = session.line_items?.data || []
      for (const item of items) {
        const quantity = item.quantity ?? 1
        const amount =
          typeof item.amount_total === 'number'
            ? item.amount_total
            : (item.price?.unit_amount || 0) * quantity
        if (quantity <= 0 || amount <= 0) continue
        const productKey =
          (typeof item.price?.product === 'string' && item.price.product) ||
          item.description ||
          item.price?.id ||
          `unknown-${aggregates.size}`

        const priceProductName =
          (item.price && (item.price as any)?.product_data?.name) ||
          (typeof item.price?.product === 'object'
            ? ((item.price.product as Stripe.Product)?.name ?? null)
            : null)
        const name =
          item.description || priceProductName || item.price?.nickname || 'Untitled product'

        const aggregate = aggregates.get(productKey) || {name, total: 0, units: 0}
        aggregate.name = aggregate.name || name
        aggregate.total += amount
        aggregate.units += quantity
        aggregates.set(productKey, aggregate)
      }

      inspectedSessions += 1
      if (inspectedSessions >= DEFAULT_SESSION_SCAN_LIMIT) {
        break
      }
    }
  } catch (err) {
    console.error('stripe-analytics: failed to iterate checkout sessions', err)
  }

  const rows = Array.from(aggregates.values())
    .filter((entry) => entry.total > 0 && entry.units > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map<StripeAnalyticsProductRow>((entry) => ({
      name: entry.name,
      revenue: centsToAmount(entry.total),
      unitsSold: entry.units,
    }))

  return rows
}
