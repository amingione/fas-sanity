import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

type PayoutSummary = {
  currency: string
  nextArrival?: string
  nextAmount?: number
  pendingBalance: number
  availableBalance: number
  recentPayouts: Array<{
    id: string
    arrivalDate: string
    amount: number
    status: string
    method: string
    description?: string
  }>
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
        body: JSON.stringify({error: 'Method not allowed'}),
      }
    }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return {
        statusCode: 500,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
        body: JSON.stringify({error: 'Stripe key not configured'}),
      }
    }

    const stripe = new Stripe(secretKey, {apiVersion: STRIPE_API_VERSION})

    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({
        limit: 6,
        arrival_date: {
          gte: Math.floor(Date.now() / 1000) - 120 * 24 * 60 * 60,
        },
      }),
    ])

    const defaultCurrency = balance.pending[0]?.currency || balance.available[0]?.currency || 'usd'
    const pendingBalance = sumByCurrency(balance.pending, defaultCurrency)
    const availableBalance = sumByCurrency(balance.available, defaultCurrency)

    const upcoming = payouts.data.find(
      (payout) => payout.status === 'in_transit' || payout.status === 'pending',
    )
    const recentPayouts = payouts.data.map((payout) => ({
      id: payout.id,
      arrivalDate: toIsoDate(payout.arrival_date),
      amount: normalizeAmount(payout.amount, payout.currency || defaultCurrency),
      status: payout.status,
      method: payout.method || 'standard',
      description: payout.description || undefined,
    }))

    const summary: PayoutSummary = {
      currency: defaultCurrency,
      pendingBalance: normalizeAmount(pendingBalance, defaultCurrency),
      availableBalance: normalizeAmount(availableBalance, defaultCurrency),
      recentPayouts,
    }

    if (upcoming) {
      summary.nextArrival = toIsoDate(upcoming.arrival_date)
      summary.nextAmount = normalizeAmount(upcoming.amount, upcoming.currency || defaultCurrency)
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=120, stale-while-revalidate=300',
      },
      body: JSON.stringify(summary),
    }
  } catch (err) {
    console.error('fetchStripePayouts error', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({
        error: 'Unexpected error',
        detail: err instanceof Error ? err.message : String(err),
      }),
    }
  }
}

function sumByCurrency(
  entries: Array<{amount: number; currency: string}>,
  currency: string,
): number {
  return entries
    .filter((entry) => entry.currency === currency)
    .reduce((sum, entry) => sum + (entry.amount || 0), 0)
}

function normalizeAmount(amount: number, currency: string): number {
  // Stripe reports in the smallest currency unit
  if (currency.toLowerCase() === 'jpy') return amount
  return amount / 100
}

function toIsoDate(unix: number | null): string {
  if (!unix) return new Date().toISOString()
  return new Date(unix * 1000).toISOString()
}
