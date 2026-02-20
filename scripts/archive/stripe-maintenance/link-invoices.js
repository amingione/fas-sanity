#!/usr/bin/env node
const dotenv = require('dotenv')
dotenv.config()


const {createSanityClient, createStripeClient, findInvoiceDocIdByStripeId} = require('./shared')

const LIMIT = Number(process.env.LINK_INVOICE_LIMIT || 100)

const ORDERS_QUERY = (limit) => `*[_type == "order" && !defined(invoiceRef) && defined(orderNumber)] | order(_createdAt desc)[0...${limit}]{
  _id,
  orderNumber,
  paymentIntentId,
  stripeSessionId
}`

async function resolveStripeInvoiceId(stripe, order) {
  if (order.paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
      expand: ['invoice'],
    })
    if (typeof pi.invoice === 'string') return pi.invoice
    if (pi.invoice && typeof pi.invoice === 'object' && pi.invoice.id) return pi.invoice.id
  }
  if (order.stripeSessionId) {
    const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
      expand: ['invoice'],
    })
    if (typeof session.invoice === 'string') return session.invoice
    if (session.invoice && typeof session.invoice === 'object' && session.invoice.id)
      return session.invoice.id
  }
  return null
}

async function run() {
  const sanity = createSanityClient()
  const stripe = createStripeClient()

  const orders = await sanity.fetch(ORDERS_QUERY(LIMIT))
  if (!orders.length) {
    console.log('No orders missing invoiceRef.')
    return
  }

  for (const order of orders) {
    let invoiceDocId =
      (await sanity.fetch(
        `*[_type == "invoice" && orderNumber == $num][0]._id`,
        {num: order.orderNumber},
      )) || null

    if (!invoiceDocId) {
      try {
        const stripeInvoiceId = await resolveStripeInvoiceId(stripe, order)
        if (stripeInvoiceId) {
          invoiceDocId = await findInvoiceDocIdByStripeId(sanity, stripeInvoiceId)
        }
      } catch (err) {
        console.warn(
          `Failed to resolve Stripe invoice for order ${order.orderNumber || order._id}`,
          err,
        )
      }
    }

    if (!invoiceDocId) {
      console.log(
        `Order ${order.orderNumber || order._id} is still missing an invoice reference - no matching invoice found.`,
      )
      continue
    }

    await sanity
      .patch(order._id)
      .set({invoiceRef: {_type: 'reference', _ref: invoiceDocId}})
      .commit({autoGenerateArrayKeys: true})

    await sanity
      .patch(invoiceDocId)
      .setIfMissing({orderRef: {_type: 'reference', _ref: order._id}})
      .commit({autoGenerateArrayKeys: true})

    console.log(
      `Linked order ${order.orderNumber || order._id} to invoice ${invoiceDocId}.`,
    )
  }

  console.log('Invoice linking complete.')
}

run().catch((err) => {
  console.error('link-invoices failed:', err)
  process.exit(1)
})
