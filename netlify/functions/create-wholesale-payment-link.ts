import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {requireSanityCredentials} from '../lib/sanityEnv'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

const SANITY_API_VERSION = '2024-10-01'
const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe =
  stripeSecret && stripeSecret.trim()
    ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION})
    : null

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const {projectId, dataset, token} = requireSanityCredentials()
const sanity = createClient({
  projectId,
  dataset,
  apiVersion: SANITY_API_VERSION,
  token,
  useCdn: false,
})

type OrderCartItem = {
  name?: string
  sku?: string
  quantity?: number | null
  price?: number | null
  total?: number | null
  lineTotal?: number | null
}

const normalizePaymentTerms = (value?: string | null): string => {
  const clean = (value || '').toString().toLowerCase()
  if (['net30', 'net_30', 'net-30'].includes(clean)) return 'net30'
  if (['net60', 'net_60', 'net-60'].includes(clean)) return 'net60'
  if (['net90', 'net_90', 'net-90'].includes(clean)) return 'net90'
  if (['upon_receipt', 'upon-receipt', 'due_on_receipt', 'due-on-receipt'].includes(clean)) {
    return 'upon_receipt'
  }
  return 'immediate'
}

const buildLineItems = (order: any): Stripe.PaymentLinkCreateParams.LineItem[] => {
  const currency = order?.currency || 'usd'
  const items: Stripe.PaymentLinkCreateParams.LineItem[] = []

  if (Array.isArray(order?.cart)) {
    for (const item of order.cart as OrderCartItem[]) {
      const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1
      const lineTotal =
        typeof item.lineTotal === 'number'
          ? item.lineTotal
          : typeof item.total === 'number'
            ? item.total
            : undefined
      const unitPrice =
        typeof item.price === 'number'
          ? item.price
          : lineTotal && quantity
            ? lineTotal / quantity
            : 0

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue

      items.push({
        quantity,
        price_data: {
          currency,
          product_data: {
            name: item.name || item.sku || 'Wholesale item',
            metadata: item.sku ? {sku: item.sku} : undefined,
          },
          unit_amount: Math.round(unitPrice * 100),
        },
      })
    }
  }

  if (!items.length && typeof order?.totalAmount === 'number' && order.totalAmount > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency,
        product_data: {name: `Wholesale order ${order?.orderNumber || ''}`.trim()},
        unit_amount: Math.round(order.totalAmount * 100),
      },
    })
  }

  return items
}

const createVendorMessage = async (params: {
  vendorId?: string
  orderId: string
  orderNumber?: string
  paymentLinkUrl?: string
  totalAmount?: number
  paymentTerms?: string
  dueDate?: string
}) => {
  const {vendorId, orderId, orderNumber, paymentLinkUrl, totalAmount, paymentTerms, dueDate} =
    params
  if (!vendorId) return

  const formatMoney = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A'
    return `$${value.toFixed(2)}`
  }

  const parts: string[] = []
  if (orderNumber) parts.push(`Order ${orderNumber}`)
  if (typeof totalAmount === 'number') parts.push(`Total: ${formatMoney(totalAmount)}`)
  if (paymentTerms) parts.push(`Payment terms: ${paymentTerms.toUpperCase()}`)
  if (dueDate) parts.push(`Due date: ${new Date(dueDate).toLocaleDateString()}`)
  if (paymentLinkUrl) parts.push(`Payment link: ${paymentLinkUrl}`)

  await sanity.create(
    {
      _type: 'vendorMessage',
      vendor: {_type: 'reference', _ref: vendorId},
      subject: `Order ${orderNumber || ''} approved`.trim(),
      message: parts.join('\n'),
      relatedOrder: {_type: 'reference', _ref: orderId},
      status: 'open',
      priority: 'high',
      category: 'order',
    },
    {autoGenerateArrayKeys: true},
  )
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: corsHeaders}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Missing STRIPE_SECRET_KEY'}),
    }
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {}
    const orderId = (payload.orderId || '').toString().replace(/^drafts\./, '')
    if (!orderId) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'orderId required'})}
    }

    const order = await sanity.fetch(
      `*[_id == $orderId][0]{
        _id,
        orderNumber,
        orderType,
        currency,
        totalAmount,
        amountSubtotal,
        amountTax,
        amountShipping,
        wholesaleDetails{
          workflowStatus
        },
        customerRef->{_id, companyName, portalAccess, primaryContact, paymentTerms},
        cart[]{name, sku, quantity, price, total, lineTotal}
      }`,
      {orderId},
    )

    if (!order) {
      return {statusCode: 404, headers: corsHeaders, body: JSON.stringify({error: 'Order not found'})}
    }
    if (order.orderType !== 'wholesale') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({error: 'Not a wholesale order'}),
      }
    }

    const paymentTerms = normalizePaymentTerms(order.customerRef?.paymentTerms)
    const vendorId = order.customerRef?._id
    const workflowStatus = order.wholesaleDetails?.workflowStatus
    const basePatch = sanity
      .patch(order._id)
      .setIfMissing({wholesaleDetails: {}})
      .set({
        'wholesaleDetails.workflowStatus': 'approved',
      })

    if (paymentTerms === 'immediate') {
      const lineItems = buildLineItems(order)
      if (!lineItems.length) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({error: 'Order has no billable line items'}),
        }
      }

      const link = await stripe.paymentLinks.create({
        line_items: lineItems,
        metadata: {
          orderId: order._id,
          orderNumber: order.orderNumber || '',
          poNumber: order.wholesaleDetails?.poNumber || '',
          workflowStatus: workflowStatus || '',
        },
      })

      await basePatch.commit({autoGenerateArrayKeys: true})

      await createVendorMessage({
        vendorId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentLinkUrl: link.url,
        totalAmount: order.totalAmount,
        paymentTerms,
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          paymentLinkId: link.id,
          paymentLinkUrl: link.url,
          workflowStatus: 'approved',
        }),
      }
    }

    const days =
      paymentTerms === 'net30' ? 30 : paymentTerms === 'net60' ? 60 : paymentTerms === 'net90' ? 90 : 0
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + days)
    const dueIso = dueDate.toISOString()

    await basePatch.commit({autoGenerateArrayKeys: true})

    await createVendorMessage({
      vendorId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      paymentTerms,
      dueDate: dueIso,
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        paymentTerms,
        dueDate: dueIso,
        workflowStatus: 'approved',
      }),
    }
  } catch (error) {
    console.error('create-wholesale-payment-link failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: message})}
  }
}

export {handler}
