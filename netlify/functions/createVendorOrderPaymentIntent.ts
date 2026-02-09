import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

const stripeSecret = process.env.STRIPE_SECRET_KEY || ''
const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION}) : null

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''
const SANITY_STUDIO_DATASET = process.env.SANITY_STUDIO_DATASET || 'production'

const sanity =
  SANITY_STUDIO_PROJECT_ID && process.env.SANITY_API_TOKEN
    ? createClient({
        projectId: SANITY_STUDIO_PROJECT_ID,
        dataset: SANITY_STUDIO_DATASET,
        apiVersion: '2024-04-10',
        token: process.env.SANITY_API_TOKEN as string,
        useCdn: false,
      })
    : null

const toCentsStrict = (value: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid amount')
  }
  const normalized = value.toFixed(2)
  const [wholeRaw, frac = '00'] = normalized.split('.')
  const sign = wholeRaw.startsWith('-') ? -1 : 1
  const whole = Math.abs(Number.parseInt(wholeRaw, 10))
  const cents = whole * 100 + Number.parseInt(frac.padEnd(2, '0').slice(0, 2), 10)
  return cents * sign
}

export const handler: Handler = async (event) => {
  return {
    statusCode: 410,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      error:
        'Deprecated: Vendor order PaymentIntents are created at invoice time only.',
    }),
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!stripe || !sanity) {
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe or Sanity not configured'}),
    }
  }

  const body = event.body ? JSON.parse(event.body) : {}
  const vendorOrderId = typeof body.vendorOrderId === 'string' ? body.vendorOrderId.trim() : ''
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : ''

  if (!vendorOrderId || !invoiceId) {
    return {
      statusCode: 400,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing vendorOrderId or invoiceId'}),
    }
  }

  try {
    const vendorOrder = await sanity.fetch(
      `*[_type == "vendorOrder" && _id == $id][0]{
        _id,
        totalAmount,
        currency,
        vendor->{_id},
        customerRef->{_id},
        stripePaymentIntentId
      }`,
      {id: vendorOrderId},
    )
    if (!vendorOrder) {
      return {
        statusCode: 404,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Vendor order not found'}),
      }
    }

    if (vendorOrder.stripePaymentIntentId) {
      return {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ok: true, paymentIntentId: vendorOrder.stripePaymentIntentId}),
      }
    }

    const invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{_id, total}`,
      {id: invoiceId},
    )
    if (!invoice) {
      return {
        statusCode: 404,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invoice not found'}),
      }
    }

    const amountCents = toCentsStrict(Number(invoice.total))
    if (amountCents <= 0) {
      return {
        statusCode: 400,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invoice total must be greater than zero'}),
      }
    }

    const currency = (vendorOrder.currency || 'USD').toLowerCase()

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      automatic_payment_methods: {enabled: true},
      metadata: {
        sanity_vendor_order_id: vendorOrderId,
        sanity_invoice_id: invoiceId,
        sanity_vendor_id: vendorOrder.vendor?._id || '',
        sanity_customer_id: vendorOrder.customerRef?._id || '',
      },
    })

    const now = new Date().toISOString()
    await sanity
      .patch(vendorOrderId)
      .set({
        stripePaymentIntentId: paymentIntent.id,
        stripePaymentStatus: paymentIntent.status,
        stripeLastSyncedAt: now,
      })
      .commit()

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        ok: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('createVendorOrderPaymentIntent failed', error)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: message}),
    }
  }
}
