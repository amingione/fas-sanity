import 'dotenv/config'
import {createClient, type SanityClient} from '@sanity/client'
import {
  linkCheckoutSessionToCustomer,
  linkInvoiceToCustomer,
  linkOrderToCustomer,
  linkOrderToInvoice,
  linkShipmentToOrder,
} from '../netlify/lib/referenceIntegrity'
import {parseStripeSummaryData} from '../netlify/lib/stripeSummary'

type OrderDoc = {
  _id: string
  orderNumber?: string
  status?: string
  customerRef?: {_ref?: string}
  customerEmail?: string | null
  stripeSummary?: {data?: string | null} | Record<string, any> | null
}

type InvoiceDoc = {
  _id: string
  orderNumber?: string
  orderRef?: {_ref?: string}
  customerRef?: {_ref?: string}
}

type ShipmentDoc = {
  _id: string
  reference?: string | null
  easypostId?: string | null
  trackingCode?: string | null
  trackingNumber?: string | null
  stripePaymentIntentId?: string | null
}

type CheckoutSessionDoc = {
  _id: string
  customerEmail?: string | null
  customerName?: string | null
}

const projectId =
  process.env.SANITY_PROJECT_ID ||
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset =
  process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || process.env.SANITY_PROJECT_DATASET || 'production'
const token =
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN ||
  process.env.SANITY_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity credentials. Set SANITY_PROJECT_ID/SANITY_STUDIO_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeId = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

const normalizeOrderNumber = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
}

async function findOrCreateCustomer(
  sanity: SanityClient,
  email?: string | null,
  name?: string | null,
): Promise<string | null> {
  const normalizedEmail = (email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  try {
    const existingId = await sanity.fetch<string | null>(
      `*[_type == "customer" && lower(email) == $email][0]._id`,
      {email: normalizedEmail},
    )
    if (existingId) return existingId
  } catch (err) {
    console.warn('repair-references: failed to lookup customer by email', err)
  }

  try {
    const created = await sanity.create({
      _type: 'customer',
      email: normalizedEmail,
      name: name?.trim() || normalizedEmail,
      roles: ['customer'],
    })
    return created?._id || null
  } catch (err) {
    console.warn('repair-references: failed to create customer', err)
    return null
  }
}

async function repairOrdersWithoutInvoices(sanity: SanityClient) {
  const orders = await sanity.fetch<OrderDoc[]>(
    `*[_type == "order" && status in ["paid","fulfilled","shipped","completed","delivered"] && !defined(invoiceRef)]{
      _id, orderNumber, status, customerRef, customerEmail, stripeSummary
    }`,
  )

  let linked = 0
  for (const order of orders) {
    const orderId = normalizeId(order._id)
    if (!orderId) continue
    const orderNumber = normalizeOrderNumber(order.orderNumber)
    const customerId = order.customerRef?._ref
      ? normalizeId(order.customerRef._ref)
      : undefined

    let invoice = null as InvoiceDoc | null
    try {
      invoice = await sanity.fetch<InvoiceDoc | null>(
        `*[_type == "invoice" && (orderRef._ref == $orderId || orderNumber == $orderNumber)][0]{_id, orderRef, customerRef, orderNumber}`,
        {orderId, orderNumber},
      )
    } catch (err) {
      console.warn('repair-references: failed to find invoice for order', {orderId, err})
    }

    if (!invoice) {
      try {
        const newInvoice = await sanity.create({
          _type: 'invoice',
          title: orderNumber ? `Invoice ${orderNumber}` : `Invoice for ${orderId}`,
          orderNumber: orderNumber || undefined,
          invoiceNumber: orderNumber ? orderNumber.replace(/^FAS-/i, 'INV-') : undefined,
          status: order.status || 'paid',
          orderRef: {_type: 'reference', _ref: orderId},
          customerRef: customerId ? {_type: 'reference', _ref: customerId} : undefined,
        })
        invoice = {_id: newInvoice._id, orderRef: {_ref: orderId}, customerRef: customerId ? {_ref: customerId} : undefined}
        console.log(`Created invoice for order ${orderNumber || orderId}: ${newInvoice._id}`)
      } catch (err) {
        console.warn('repair-references: failed to create invoice for order', {orderId, err})
        continue
      }
    }

    await linkOrderToInvoice(sanity, orderId, invoice._id)
    if (customerId && !invoice.customerRef?._ref) {
      await linkInvoiceToCustomer(sanity, invoice._id, customerId)
    }
    linked++
    await delay(50)
  }

  console.log(`Orders without invoices processed: ${linked}/${orders.length}`)
}

async function repairOrdersWithoutCustomers(sanity: SanityClient) {
  const orders = await sanity.fetch<OrderDoc[]>(
    `*[_type == "order" && !defined(customerRef)]{
      _id, orderNumber, customerEmail, stripeSummary
    }`,
  )

  let linked = 0
  for (const order of orders) {
    const orderId = normalizeId(order._id)
    if (!orderId) continue
    const stripeSummary = parseStripeSummaryData(order.stripeSummary)
    const email =
      (order.customerEmail || stripeSummary?.customer?.email || '').toString().trim() || ''
    const customerId = await findOrCreateCustomer(sanity, email, order.orderNumber || undefined)
    if (!customerId) continue
    await linkOrderToCustomer(sanity, orderId, customerId)
    linked++
    await delay(25)
  }

  console.log(`Orders without customers processed: ${linked}/${orders.length}`)
}

async function repairInvoicesWithoutCustomers(sanity: SanityClient) {
  const invoices = await sanity.fetch<InvoiceDoc[]>(
    `*[_type == "invoice" && !defined(customerRef)]{_id, orderRef, orderNumber}`,
  )
  let linked = 0

  for (const invoice of invoices) {
    const invoiceId = normalizeId(invoice._id)
    if (!invoiceId) continue
    let customerId: string | null = null

    const orderId = normalizeId(invoice.orderRef?._ref)
    if (orderId) {
      try {
        customerId = await sanity.fetch<string | null>(
          `*[_type == "order" && _id == $id][0].customerRef._ref`,
          {id: orderId},
        )
      } catch (err) {
        console.warn('repair-references: failed to lookup order for invoice', {invoiceId, err})
      }
    } else if (invoice.orderNumber) {
      try {
        customerId = await sanity.fetch<string | null>(
          `*[_type == "order" && orderNumber == $orderNumber][0].customerRef._ref`,
          {orderNumber: invoice.orderNumber},
        )
      } catch (err) {
        console.warn('repair-references: failed to find order by number for invoice', {
          invoiceId,
          err,
        })
      }
    }

    if (!customerId) continue
    await linkInvoiceToCustomer(sanity, invoiceId, customerId)
    linked++
    await delay(25)
  }

  console.log(`Invoices without customers processed: ${linked}/${invoices.length}`)
}

async function repairInvoicesWithoutOrders(sanity: SanityClient) {
  const invoices = await sanity.fetch<InvoiceDoc[]>(
    `*[_type == "invoice" && !defined(orderRef) && defined(orderNumber)]{_id, orderNumber}`,
  )
  let linked = 0

  for (const invoice of invoices) {
    const invoiceId = normalizeId(invoice._id)
    if (!invoiceId) continue
    try {
      const orderId = await sanity.fetch<string | null>(
        `*[_type == "order" && orderNumber == $orderNumber][0]._id`,
        {orderNumber: invoice.orderNumber},
      )
      if (!orderId) continue
      await linkOrderToInvoice(sanity, orderId, invoiceId)
      linked++
      await delay(25)
    } catch (err) {
      console.warn('repair-references: failed to attach order to invoice', {invoiceId, err})
    }
  }

  console.log(`Invoices without orders processed: ${linked}/${invoices.length}`)
}

async function repairInvoicesMissingOrderRefsFromOrders(sanity: SanityClient) {
  const orders = await sanity.fetch<
    Array<{_id: string; orderNumber?: string; customerRef?: {_ref?: string} | null; invoiceRef?: {_ref?: string} | null}>
  >(
    `*[_type == "order" && defined(invoiceRef._ref)]{
      _id,
      orderNumber,
      customerRef,
      invoiceRef
    }`,
  )

  let linked = 0
  for (const order of orders) {
    const orderId = normalizeId(order._id)
    const invoiceId = normalizeId(order.invoiceRef?._ref)
    if (!orderId || !invoiceId) continue

    let invoice: InvoiceDoc | null = null
    try {
      invoice = await sanity.fetch<InvoiceDoc | null>(
        `*[_type == "invoice" && _id == $id][0]{_id, orderRef, customerRef, orderNumber}`,
        {id: invoiceId},
      )
    } catch (err) {
      console.warn('repair-references: failed to load invoice for order link check', {
        orderId,
        invoiceId,
        err,
      })
    }

    if (!invoice?._id) continue

    const invoiceOrderId = normalizeId(invoice.orderRef?._ref)
    const orderCustomerId = normalizeId(order.customerRef?._ref)
    const invoiceCustomerId = normalizeId(invoice.customerRef?._ref)
    const needsOrderLink = invoiceOrderId !== orderId
    const needsCustomerLink = !invoiceCustomerId && !!orderCustomerId
    const needsOrderNumber = !invoice.orderNumber && order.orderNumber

    if (!needsOrderLink && !needsCustomerLink && !needsOrderNumber) continue

    try {
      if (needsOrderLink) {
        await linkOrderToInvoice(sanity, orderId, invoiceId)
      }
      if (needsCustomerLink && orderCustomerId) {
        await linkInvoiceToCustomer(sanity, invoiceId, orderCustomerId)
      }
      if (needsOrderNumber && order.orderNumber) {
        await sanity
          .patch(invoiceId)
          .set({orderNumber: order.orderNumber})
          .commit({autoGenerateArrayKeys: true})
      }
      linked++
      await delay(25)
    } catch (err) {
      console.warn('repair-references: failed to normalize invoice link for order', {
        orderId,
        invoiceId,
        err,
      })
    }
  }

  console.log(`Invoices normalized from orders: ${linked}/${orders.length}`)
}

async function repairShipmentsWithoutOrders(sanity: SanityClient) {
  const shipments = await sanity.fetch<ShipmentDoc[]>(
    `*[_type == "shipment" && !defined(order)]{_id, reference, easypostId, trackingCode, trackingNumber, stripePaymentIntentId}`,
  )

  let linked = 0
  for (const shipment of shipments) {
    const shipmentId = normalizeId(shipment._id)
    if (!shipmentId) continue

    const reference = shipment.reference?.trim() || null
    const tracking = shipment.trackingNumber || shipment.trackingCode || null
    let orderId: string | null = null

    try {
      orderId =
        (await sanity.fetch<string | null>(
          `*[_type == "order" && (
            easyPostShipmentId == $easypostId ||
            trackingNumber == $tracking ||
          orderNumber == $reference ||
          paymentIntentId == $paymentIntent ||
          stripePaymentIntentId == $paymentIntent
        )][0]._id`,
          {
            easypostId: shipment.easypostId || null,
            tracking: tracking,
            reference,
            paymentIntent: shipment.stripePaymentIntentId || null,
          },
        )) || null
    } catch (err) {
      console.warn('repair-references: failed to find order for shipment', {shipmentId, err})
    }

    if (!orderId) continue
    await linkShipmentToOrder(sanity, shipmentId, orderId)
    linked++
    await delay(25)
  }

  console.log(`Shipments without orders processed: ${linked}/${shipments.length}`)
}

async function repairCheckoutSessionsWithoutCustomers(sanity: SanityClient) {
  const sessions = await sanity.fetch<CheckoutSessionDoc[]>(
    `*[_type == "checkoutSession" && !defined(customerRef) && defined(customerEmail)]{_id, customerEmail, customerName}`,
  )
  let linked = 0

  for (const session of sessions) {
    const sessionId = normalizeId(session._id)
    if (!sessionId) continue
    const customerId = await findOrCreateCustomer(
      sanity,
      session.customerEmail,
      session.customerName || undefined,
    )
    if (!customerId) continue
    await linkCheckoutSessionToCustomer(sanity, sessionId, customerId)
    linked++
    await delay(25)
  }

  console.log(`Checkout sessions without customers processed: ${linked}/${sessions.length}`)
}

async function logCartIntegrity(sanity: SanityClient) {
  const count = await sanity.fetch<number>(
    `count(*[_type == "order" && status in ["paid","fulfilled","shipped","completed"] && (!defined(cart) || length(cart) == 0)])`,
  )
  if (count > 0) {
    console.warn(`Warning: ${count} paid/fulfilled orders have empty carts`)
  } else {
    console.log('No paid orders with empty carts detected')
  }
}

async function main() {
  console.log('Starting reference repair…')
  await repairOrdersWithoutInvoices(client)
  await repairOrdersWithoutCustomers(client)
  await repairInvoicesWithoutCustomers(client)
  await repairInvoicesWithoutOrders(client)
  await repairInvoicesMissingOrderRefsFromOrders(client)
  await repairShipmentsWithoutOrders(client)
  await repairCheckoutSessionsWithoutCustomers(client)
  await logCartIntegrity(client)
  console.log('Reference repair complete.')
}

main().catch((err) => {
  console.error('repair-references: fatal error', err)
  process.exit(1)
})
