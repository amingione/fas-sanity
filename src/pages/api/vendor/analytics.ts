/**
 * GET /api/vendor/analytics
 *
 * Returns aggregated analytics for the authenticated vendor:
 *   - Order stats (total, by status, recent 30-day trend)
 *   - Invoice stats (total, paid, outstanding balance)
 *   - Activity counts (events in the last 30 days)
 *
 * Requires the view_analytics permission scope.
 *
 * Query params:
 *   days - lookback window for trends (default: 30, max: 365)
 *
 * Response 200: { analytics: VendorAnalytics }
 * Response 401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, requirePermission, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

interface OrderStatusCount {
  status: string
  count: number
}

interface VendorAnalytics {
  orders: {
    total: number
    byStatus: OrderStatusCount[]
    recentCount: number         // orders in lookback window
    recentRevenue: number       // totalAmount sum in lookback window
  }
  invoices: {
    total: number
    paid: number
    pending: number
    overdue: number
    outstandingBalance: number  // sum of amountDue on non-paid invoices
  }
  activity: {
    recentEventCount: number    // events in lookback window
  }
  generatedAt: string
}

// GROQ — single multi-projection query for efficiency
const ANALYTICS_QUERY = `{
  "orderTotal": count(*[_type == "vendorOrder" && vendor._ref == $vendorId]),
  "orderByStatus": *[_type == "vendorOrder" && vendor._ref == $vendorId] {
    status
  },
  "recentOrders": *[
    _type == "vendorOrder" &&
    vendor._ref == $vendorId &&
    createdAt > $since
  ] {
    totalAmount
  },
  "invoiceTotal": count(*[_type == "invoice" && vendorRef._ref == $vendorId]),
  "invoicePaid": count(*[_type == "invoice" && vendorRef._ref == $vendorId && status == "paid"]),
  "invoicePending": count(*[_type == "invoice" && vendorRef._ref == $vendorId && status in ["pending", "sent", "partially_paid"]]),
  "invoiceOverdue": count(*[_type == "invoice" && vendorRef._ref == $vendorId && status == "overdue"]),
  "invoiceOutstandingAmounts": *[
    _type == "invoice" &&
    vendorRef._ref == $vendorId &&
    status in ["pending", "sent", "partially_paid", "overdue"]
  ] {
    amountDue
  },
  "recentEventCount": count(*[
    _type == "vendorActivityEvent" &&
    vendorId == $vendorId &&
    occurredAt > $since
  ])
}`

type AnalyticsRaw = {
  orderTotal: number
  orderByStatus: {status: string}[]
  recentOrders: {totalAmount: number | null}[]
  invoiceTotal: number
  invoicePaid: number
  invoicePending: number
  invoiceOverdue: number
  invoiceOutstandingAmounts: {amountDue: number | null}[]
  recentEventCount: number
}

export const GET: APIRoute = async ({request}) => {
  try {
    const {vendor, token} = await requireVendorAuth(request)
    requirePermission(token, 'view_analytics')

    const url = new URL(request.url)
    const daysParam = url.searchParams.get('days')
    const days = Math.min(parseInt(daysParam ?? '30', 10) || 30, 365)

    if (days <= 0) {
      return jsonError('days must be a positive integer', 400)
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const raw = await sanityClient.fetch<AnalyticsRaw>(ANALYTICS_QUERY, {
      vendorId: vendor._id,
      since,
    })

    // Aggregate order status counts
    const statusCounts: Record<string, number> = {}
    for (const {status} of raw.orderByStatus ?? []) {
      if (status) {
        statusCounts[status] = (statusCounts[status] ?? 0) + 1
      }
    }
    const byStatus: OrderStatusCount[] = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }))

    const recentRevenue = (raw.recentOrders ?? []).reduce(
      (sum, o) => sum + (o.totalAmount ?? 0),
      0,
    )

    const outstandingBalance = (raw.invoiceOutstandingAmounts ?? []).reduce(
      (sum, i) => sum + (i.amountDue ?? 0),
      0,
    )

    const analytics: VendorAnalytics = {
      orders: {
        total: raw.orderTotal ?? 0,
        byStatus,
        recentCount: raw.recentOrders?.length ?? 0,
        recentRevenue: Math.round(recentRevenue * 100) / 100,
      },
      invoices: {
        total: raw.invoiceTotal ?? 0,
        paid: raw.invoicePaid ?? 0,
        pending: raw.invoicePending ?? 0,
        overdue: raw.invoiceOverdue ?? 0,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      },
      activity: {
        recentEventCount: raw.recentEventCount ?? 0,
      },
      generatedAt: new Date().toISOString(),
    }

    return jsonOk({analytics})
  } catch (err) {
    return handleAuthError(err)
  }
}

export const POST: APIRoute = () =>
  new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
