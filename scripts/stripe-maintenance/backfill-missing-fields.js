#!/usr/bin/env node

const {
  createSanityClient,
  createStripeClient,
  normalizeStripeAddress,
  findInvoiceDocIdByStripeId,
  findCustomerIdByStripeId,
} = require('./shared')

const LIMIT = Number(process.env.BACKFILL_LIMIT || 50)

const ORDER_QUERY = (limit) => `*[_type == "order" && (
    !defined(cardBrand) ||
    !defined(cardLast4) ||
    !defined(receiptUrl) ||
    !defined(invoiceRef) ||
    !defined(customerRef) ||
    !defined(stripeCustomerId) ||
    stripeCustomerId == ""
  )] | order(_createdAt desc)[0...${limit}]{
    _id,
    orderNumber,
    paymentIntentId,
    stripeSessionId,
    stripeCustomerId,
    customerRef,
    customerEmail,
    cardBrand,
    cardLast4,
    receiptUrl,
    invoiceRef
  }`

async function hydrateStripeData(stripe, order) {
  const result = {
    stripeCustomerId: order.stripeCustomerId || null,
    cardBrand: null,
    cardLast4: null,
    receiptUrl: null,
    billingAddress: null,
    invoiceStripeId: null,
    invoiceDocId: null,
  }

  try {
    if (order.paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
        expand: ['charges.data.payment_method_details', 'invoice'],
      })
      const charge = pi?.charges?.data?.[pi.charges.data.length - 1]
      result.stripeCustomerId =
        (typeof pi.customer === 'string' ? pi.customer : pi.customer?.id) ||
        result.stripeCustomerId
      result.cardBrand = charge?.payment_method_details?.card?.brand || null
      result.cardLast4 = charge?.payment_method_details?.card?.last4 || null
      result.receiptUrl = charge?.receipt_url || null
      result.billingAddress =
        normalizeStripeAddress(charge?.billing_details?.address, {
          name: charge?.billing_details?.name || undefined,
          email: charge?.billing_details?.email || undefined,
          phone: charge?.billing_details?.phone || undefined,
        }) || null
      const invoiceId =
            typeof pi.invoice === 'string'
              ? pi.invoice
              : (pi.invoice && typeof pi.invoice === 'object' && pi.invoice.id) || undefined
      result.invoiceStripeId = invoiceId || null
      return result
    }

    if (order.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ['payment_intent.charges.data.payment_method_details', 'invoice'],
      })
      result.stripeCustomerId =
        (typeof session.customer === 'string' ? session.customer : undefined) ||
        result.stripeCustomerId
      const charge = session.payment_intent?.charges?.data?.[
        session.payment_intent.charges.data.length - 1
      ]
      result.cardBrand = charge?.payment_method_details?.card?.brand || null
      result.cardLast4 = charge?.payment_method_details?.card?.last4 || null
      result.receiptUrl = charge?.receipt_url || null
      result.billingAddress =
        normalizeStripeAddress(session.customer_details?.address, {
          name: session.customer_details?.name || undefined,
          email: session.customer_details?.email || undefined,
          phone: session.customer_details?.phone || undefined,
        }) || null
      const invoiceId =
        (typeof session.invoice === 'string' && session.invoice) ||
        (session.invoice && typeof session.invoice === 'object' && session.invoice.id) ||
        undefined
      result.invoiceStripeId = invoiceId || null
      return result
    }
  } catch (err) {
    console.error(
      `Failed to hydrate Stripe data for order ${order._id} (${order.orderNumber || 'unknown'})`,
      err,
    )
  }

  return result
}

function buildCustomerBillingAddress(address) {
  if (!address) return undefined
  return {
    _type: 'customerBillingAddress',
    name: address.name || undefined,
    street: address.addressLine1 || undefined,
    street2: address.addressLine2 || undefined,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postalCode || undefined,
    country: address.country || undefined,
  }
}

async function run() {
  const sanity = createSanityClient()
  const stripe = createStripeClient()

  const orders = await sanity.fetch(ORDER_QUERY(LIMIT))
  if (!orders.length) {
    console.log('No orders require backfill.')
    return
  }
  console.log(`Backfilling ${orders.length} orders...`)

  for (const order of orders) {
    const stripeDetails = await hydrateStripeData(stripe, order)
    const patch = {}
    if (!order.cardBrand && stripeDetails.cardBrand) patch.cardBrand = stripeDetails.cardBrand
    if (!order.cardLast4 && stripeDetails.cardLast4) patch.cardLast4 = stripeDetails.cardLast4
    if (!order.receiptUrl && stripeDetails.receiptUrl) patch.receiptUrl = stripeDetails.receiptUrl
    if (!order.stripeCustomerId && stripeDetails.stripeCustomerId)
      patch.stripeCustomerId = stripeDetails.stripeCustomerId

    let invoiceDocId = order.invoiceRef?._ref || null
    if (!invoiceDocId && stripeDetails.invoiceStripeId) {
      invoiceDocId = await findInvoiceDocIdByStripeId(sanity, stripeDetails.invoiceStripeId)
    }
    if (invoiceDocId && !order.invoiceRef) {
      patch.invoiceRef = {_type: 'reference', _ref: invoiceDocId}
    }

    let customerId = order.customerRef?._ref || null
    if (!customerId && stripeDetails.stripeCustomerId) {
      customerId = await findCustomerIdByStripeId(sanity, stripeDetails.stripeCustomerId)
    }
    if (!customerId && order.customerEmail) {
      const email = order.customerEmail.toLowerCase()
      customerId =
        (await sanity.fetch(
          `*[_type == "customer" && defined(email) && lower(email) == $email][0]._id`,
          {email},
        )) || null
    }
    if (customerId && !order.customerRef) {
      patch.customerRef = {_type: 'reference', _ref: customerId}
    }

    if (Object.keys(patch).length > 0) {
      await sanity.patch(order._id).set(patch).commit({autoGenerateArrayKeys: true})
      console.log(
        `Updated order ${order.orderNumber || order._id}: ${Object.keys(patch).join(', ')}`,
      )
    } else {
      console.log(`Order ${order.orderNumber || order._id} already has required fields.`)
    }

    if (customerId && (stripeDetails.stripeCustomerId || stripeDetails.billingAddress)) {
      const customerPatch = {}
      if (stripeDetails.stripeCustomerId)
        customerPatch.stripeCustomerId = stripeDetails.stripeCustomerId
      const billing = buildCustomerBillingAddress(stripeDetails.billingAddress)
      if (billing) customerPatch.billingAddress = billing
      if (Object.keys(customerPatch).length > 0) {
        await sanity.patch(customerId).set(customerPatch).commit({autoGenerateArrayKeys: true})
        console.log(`Patched customer ${customerId} with Stripe details.`)
      }
    }
  }

  console.log('Backfill complete.')
}

run().catch((err) => {
  console.error('backfill-missing-fields failed:', err)
  process.exit(1)
})
