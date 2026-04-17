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

/**
 * Stripe access is prohibited outside Medusa.
 *
 * This module intentionally does not call Stripe APIs. Any Stripe reporting
 * should be implemented in Medusa (commerce authority) and surfaced to Studio
 * via Medusa-owned endpoints.
 */
export async function fetchStripeAnalytics(): Promise<StripeAnalyticsPayload> {
  throw new Error(
    'Stripe analytics is disabled in fas-sanity. Use Medusa for Stripe reporting.',
  )
}

