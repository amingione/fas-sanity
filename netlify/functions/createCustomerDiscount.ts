import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {
  hydrateDiscountResources,
  removeCustomerDiscountRecord,
  syncCustomerDiscountRecord,
} from '../lib/customerDiscounts'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  let value = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) value = origin
    else if (DEFAULT_ORIGINS.includes(origin)) value = origin
  }
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

function sanitizeDocId(value?: string | null) {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.replace(/^drafts\./, '')
}

type CreatePayload = {
  customerId?: string
  stripeCustomerId?: string
  mode?: 'percent' | 'amount'
  value?: number
  currency?: string
  duration?: 'once' | 'repeating' | 'forever'
  durationInMonths?: number
  name?: string
}

type DeletePayload = {
  stripeCustomerId?: string
  stripeDiscountId?: string
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS, body: ''}
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe not configured'}),
    }
  }

  if (event.httpMethod === 'POST') {
    let body: CreatePayload = {}
    try {
      body = JSON.parse(event.body || '{}') as CreatePayload
    } catch {
      body = {}
    }

    const stripeCustomerId = sanitizeDocId(body.stripeCustomerId || '')
    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Missing stripeCustomerId'}),
      }
    }

    const mode: 'percent' | 'amount' = body.mode === 'amount' ? 'amount' : 'percent'
    const value = Number(body.value)
    if (!Number.isFinite(value) || value <= 0) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Discount value must be a positive number'}),
      }
    }

    let currency = (body.currency || '').toString().trim().toLowerCase()
    if (mode === 'amount') {
      if (!currency) {
        return {
          statusCode: 400,
          headers: {...CORS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Amount-based discounts require a currency'}),
        }
      }
      if (currency.length !== 3) {
        return {
          statusCode: 400,
          headers: {...CORS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Currency codes should be 3 letters'}),
        }
      }
    } else {
      currency = 'usd'
    }

    if (mode === 'percent' && value > 100) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Percent discounts must be 100 or less'}),
      }
    }

    let duration: 'once' | 'repeating' | 'forever' = 'once'
    if (body.duration === 'forever' || body.duration === 'repeating') duration = body.duration

    let durationInMonths: number | undefined
    if (duration === 'repeating') {
      durationInMonths = Number(body.durationInMonths)
      if (!Number.isFinite(durationInMonths) || durationInMonths <= 0) {
        return {
          statusCode: 400,
          headers: {...CORS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Repeating discounts require durationInMonths'}),
        }
      }
    }

    try {
      const couponParams: Stripe.CouponCreateParams = {
        name: body.name?.trim() || undefined,
        duration,
      }
      if (mode === 'percent') {
        couponParams.percent_off = value
      } else {
        couponParams.amount_off = Math.round(value * 100)
        couponParams.currency = currency
      }
      if (duration === 'repeating' && durationInMonths) {
        couponParams.duration_in_months = Math.floor(durationInMonths)
      }

      const coupon = await stripe.coupons.create(couponParams)

      let discount: Stripe.Discount | null = null
      try {
        // Latest Stripe API supports explicit create endpoint but older versions rely on customer update
        const response = (await stripe.customers.update(stripeCustomerId, {coupon: coupon.id})) as Stripe.Customer
        discount = (response.discount || null) as Stripe.Discount | null
      } catch (err) {
        console.warn('createCustomerDiscount: failed to update customer with coupon', err)
      }

      if (!discount) {
        try {
          const reloaded = await stripe.customers.retrieve(stripeCustomerId, {
            expand: ['discount', 'discount.coupon', 'discount.promotion_code'],
          })
          discount = (reloaded as Stripe.Customer).discount as Stripe.Discount | null
        } catch (err) {
          console.warn('createCustomerDiscount: failed to reload customer discount', err)
        }
      }

      if (!discount) {
        return {
          statusCode: 200,
          headers: {...CORS, 'Content-Type': 'application/json'},
          body: JSON.stringify({
            ok: true,
            couponId: coupon.id,
            message: 'Coupon created. Stripe will emit a webhook to attach the discount.',
          }),
        }
      }

      const {coupon: hydratedCoupon, promotion} = await hydrateDiscountResources(stripe, discount, {
        coupon,
      })
      await syncCustomerDiscountRecord({
        sanity,
        discount,
        stripe,
        coupon: hydratedCoupon,
        promotion,
      })

      return {
        statusCode: 200,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          ok: true,
          couponId: coupon.id,
          discountId: discount.id,
        }),
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to create discount'
      return {
        statusCode: 500,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: message}),
      }
    }
  }

  if (event.httpMethod === 'DELETE') {
    let body: DeletePayload = {}
    try {
      body = JSON.parse(event.body || '{}') as DeletePayload
    } catch {
      body = {}
    }

    const stripeCustomerId = sanitizeDocId(body.stripeCustomerId || '')
    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Missing stripeCustomerId'}),
      }
    }

    try {
      await stripe.customers.update(stripeCustomerId, {coupon: ''})
      if (body.stripeDiscountId) {
        await removeCustomerDiscountRecord({
          sanity,
          stripeDiscountId: body.stripeDiscountId,
          stripeCustomerId,
        })
      }
      return {
        statusCode: 200,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({ok: true}),
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to remove discount'
      return {
        statusCode: 500,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: message}),
      }
    }
  }

  return {
    statusCode: 405,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({error: 'Method Not Allowed'}),
  }
}
