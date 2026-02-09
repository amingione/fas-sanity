import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

const stripeSecret = process.env.STRIPE_SECRET_KEY || ''
const webhookSecret = process.env.STRIPE_VENDOR_WEBHOOK_SECRET || ''
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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  if (!stripe || !sanity || !webhookSecret) {
    return {statusCode: 500, body: 'Stripe or Sanity not configured'}
  }

  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature']
  if (!signature) {
    return {statusCode: 400, body: 'Missing Stripe signature'}
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body || '', signature, webhookSecret)
  } catch (err) {
    console.error('vendorPaymentIntentWebhook signature error', err)
    return {statusCode: 400, body: 'Invalid signature'}
  }

  const type = stripeEvent.type
  const payload = stripeEvent.data.object as Stripe.PaymentIntent
  const invoiceId = payload.metadata?.sanity_invoice_id

  if (!invoiceId) {
    return {statusCode: 200, body: 'No invoice metadata'}
  }

  const now = new Date().toISOString()

  try {
    if (type === 'payment_intent.succeeded') {
      const invoice = await sanity.fetch(
        `*[_type == "invoice" && _id == $id][0]{
          _id,
          total,
          subtotal,
          tax,
          shipping,
          vendorRef->{_id, companyName, primaryContact, paymentTerms},
          customerRef->{_id},
          lineItems[]{
            _key,
            description,
            sku,
            quantity,
            unitPrice,
            lineTotal,
            total,
            product->{_id}
          },
          vendorOrderRef
        }`,
        {id: invoiceId},
      )
      if (!invoice) {
        return {statusCode: 200, body: 'Invoice not found'}
      }

      await sanity
        .patch(invoiceId)
        .set({
          status: 'paid',
          amountPaid: Number(payload.amount_received || payload.amount) / 100,
          amountDue: 0,
          stripePaymentStatus: payload.status,
          stripeLastSyncedAt: now,
        })
        .commit()

      if (!invoice.vendorOrderRef?._ref) {
        const orderNumber = `VO-${invoiceId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`
        const buildOrderCartItem = (item: any) => ({
          _type: 'orderCartItem',
          _key: item._key || Math.random().toString(36).slice(2),
          name: item.description || 'Item',
          sku: item.sku,
          price: Number(item.unitPrice) || 0,
          quantity: Number(item.quantity) || 1,
          lineTotal: Number(item.lineTotal ?? item.total ?? 0),
          total: Number(item.lineTotal ?? item.total ?? 0),
          id: item.product?._id,
          productName: item.description || 'Item',
          productRef: item.product?._id ? {_type: 'reference', _ref: item.product._id} : undefined,
        })

        const subtotal = Number(invoice.subtotal) || 0
        const tax = Number(invoice.tax) || 0
        const shipping = Number(invoice.shipping) || 0
        const total = Number(invoice.total) || subtotal + tax + shipping

        const createdOrder = await sanity.create(
          {
            _type: 'vendorOrder',
            orderNumber,
            vendor: invoice.vendorRef?._id
              ? {_type: 'reference', _ref: invoice.vendorRef._id}
              : undefined,
            customerRef: invoice.customerRef?._id
              ? {_type: 'reference', _ref: invoice.customerRef._id}
              : undefined,
            invoiceRef: {_type: 'reference', _ref: invoice._id},
            status: 'paid',
            paymentStatus: 'paid',
            currency: 'USD',
            cart: Array.isArray(invoice.lineItems)
              ? invoice.lineItems.map(buildOrderCartItem)
              : [],
            amountSubtotal: subtotal,
            amountTax: tax,
            amountShipping: shipping,
            totalAmount: total,
            createdAt: new Date().toISOString(),
          },
          {autoGenerateArrayKeys: true},
        )

        await sanity
          .patch(invoiceId)
          .set({vendorOrderRef: {_type: 'reference', _ref: createdOrder._id}})
          .commit()

        if (invoice.vendorRef?._id) {
          await sanity
            .patch(invoice.vendorRef._id)
            .setIfMissing({totalOrders: 0, totalRevenue: 0, currentBalance: 0})
            .set({lastOrderDate: now})
            .inc({totalOrders: 1, totalRevenue: total, currentBalance: total})
            .commit({autoGenerateArrayKeys: true})
        }
      }
    }

    if (type === 'payment_intent.payment_failed' || type === 'payment_intent.canceled') {
      await sanity
        .patch(invoiceId)
        .set({
          status: 'payable',
          stripePaymentStatus: payload.status,
          stripeLastSyncedAt: now,
        })
        .commit()
    }

    return {statusCode: 200, body: 'ok'}
  } catch (err) {
    console.error('vendorPaymentIntentWebhook failed', err)
    return {statusCode: 500, body: 'Webhook handling failed'}
  }
}
