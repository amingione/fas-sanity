#!/usr/bin/env tsx
import 'dotenv/config'
import {createClient} from '@sanity/client'
import {buildOrderV2Record} from '../netlify/lib/orderV2'

type OrderDoc = {
  _id: string
  _createdAt?: string
  orderNumber?: string | null
  status?: string | null
  paymentStatus?: string | null
  customerName?: string | null
  customerEmail?: string | null
  customerRef?: {_ref?: string}
  shippingAddress?: Record<string, unknown> | null
  cart?: Array<Record<string, unknown> | null> | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  totalAmount?: number | null
  amountRefunded?: number | null
  paymentIntentId?: string | null
  chargeId?: string | null
  cardBrand?: string | null
  receiptUrl?: string | null
  stripeSessionId?: string | null
  stripeLastSyncedAt?: string | null
  shippingCarrier?: string | null
  shippingServiceName?: string | null
  selectedService?: {service?: string | null; serviceCode?: string | null; carrier?: string | null}
  shippingMetadata?: Record<string, unknown> | null
  shippingEstimatedDeliveryDate?: string | null
  trackingNumber?: string | null
  webhookNotified?: boolean | null
  paymentFailureCode?: string | null
  paymentFailureMessage?: string | null
  lastRefundId?: string | null
  lastRefundReason?: string | null
  lastRefundStatus?: string | null
  lastRefundedAt?: string | null
  lastDisputeId?: string | null
  lastDisputeStatus?: string | null
  lastDisputeReason?: string | null
  lastDisputeCreatedAt?: string | null
  orderV2?: Record<string, unknown> | null
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const TOKEN =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_STUDIO_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN

if (!PROJECT_ID || !DATASET || !TOKEN) {
  console.error('Missing Sanity credentials. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN.')
  process.exit(1)
}

const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: '2024-10-01',
  token: TOKEN,
  useCdn: false,
})

const BATCH_SIZE = 50

function buildRefundEntries(order: OrderDoc) {
  if (order.lastRefundId || order.lastRefundReason || order.lastRefundedAt) {
    return [
      {
        refundId: order.lastRefundId || undefined,
        reason: order.lastRefundReason || undefined,
        status: order.lastRefundStatus || undefined,
        date: order.lastRefundedAt || undefined,
        amount: order.amountRefunded || undefined,
      },
    ]
  }
  return undefined
}

function buildDisputeEntries(order: OrderDoc) {
  if (order.lastDisputeId || order.lastDisputeReason || order.lastDisputeCreatedAt) {
    return [
      {
        disputeId: order.lastDisputeId || undefined,
        status: order.lastDisputeStatus || undefined,
        reason: order.lastDisputeReason || undefined,
        date: order.lastDisputeCreatedAt || undefined,
      },
    ]
  }
  return undefined
}

function deriveLegacyDiscount(order: OrderDoc) {
  const subtotal = toNumber(order.amountSubtotal)
  const total = toNumber(order.totalAmount)
  const shipping = toNumber(order.amountShipping)
  const tax = toNumber(order.amountTax)
  if (subtotal === undefined || total === undefined) return undefined

  const baseline = total - (shipping ?? 0) - (tax ?? 0)
  const discount = subtotal - baseline
  if (discount > 0.01) return discount
  return undefined
}

function deriveOrderV2Input(order: OrderDoc) {
  const shippingCarrier = order.shippingCarrier || order.selectedService?.carrier || undefined
  const shippingServiceName =
    order.shippingServiceName || order.selectedService?.service || order.selectedService?.serviceCode || undefined

  const discount = deriveLegacyDiscount(order)

  return buildOrderV2Record({
    orderId: (order.orderV2 as any)?.orderId || order.orderNumber || order.stripeSessionId || order._id,
    createdAt: (order.orderV2 as any)?.createdAt || order._createdAt,
    status: (order.orderV2 as any)?.status || order.status || order.paymentStatus || undefined,
    customerId: order.customerRef?._ref || undefined,
    customerRef: order.customerRef,
    customerName: order.customerName || undefined,
    customerEmail: order.customerEmail || undefined,
    customerPhone: (order.shippingAddress as any)?.phone || undefined,
    shippingAddress: order.shippingAddress || undefined,
    cart: Array.isArray(order.cart) ? (order.cart as any) : undefined,
    subtotal: order.amountSubtotal || undefined,
    discount,
    shippingFee: order.amountShipping || undefined,
    tax: order.amountTax || undefined,
    total: order.totalAmount || undefined,
    paymentStatus: order.paymentStatus || undefined,
    stripePaymentIntentId: order.paymentIntentId || undefined,
    stripeChargeId: order.chargeId || undefined,
    receiptUrl: order.receiptUrl || undefined,
    paymentMethod: undefined,
    cardBrand: order.cardBrand || undefined,
    shippingCarrier,
    shippingServiceName,
    shippingTrackingNumber: order.trackingNumber || undefined,
    shippingStatus: order.status || undefined,
    shippingEstimatedDelivery: order.shippingEstimatedDeliveryDate || undefined,
    notes: undefined,
    webhookStatus: order.webhookNotified ? 'sent' : undefined,
    webhookNotified: order.webhookNotified ?? null,
    lastSync: order.stripeLastSyncedAt || undefined,
    failureReason: order.paymentFailureMessage || order.paymentFailureCode || undefined,
    refunds: buildRefundEntries(order),
    disputes: buildDisputeEntries(order),
    stripeEventLog: [],
  })
}

async function run() {
  let offset = 0
  let processed = 0
  while (true) {
    const orders = await client.fetch<OrderDoc[]>(
      `*[_type == "order"] | order(_createdAt asc) [$start...$end]{
        _id,
        _createdAt,
        orderNumber,
        status,
        paymentStatus,
        customerName,
        customerEmail,
        customerRef,
        shippingAddress,
        cart,
        amountSubtotal,
        amountTax,
        amountShipping,
        totalAmount,
        amountRefunded,
        paymentIntentId,
        chargeId,
        cardBrand,
        receiptUrl,
        stripeSessionId,
        stripeLastSyncedAt,
        shippingCarrier,
        shippingServiceName,
        selectedService,
        shippingMetadata,
        shippingEstimatedDeliveryDate,
        trackingNumber,
        webhookNotified,
        paymentFailureCode,
        paymentFailureMessage,
        lastRefundId,
        lastRefundReason,
        lastRefundStatus,
        lastRefundedAt,
        lastDisputeId,
        lastDisputeStatus,
        lastDisputeReason,
        lastDisputeCreatedAt,
        orderV2
      }`,
      {start: offset, end: offset + BATCH_SIZE}
    )

    if (!orders.length) break

    const tx = client.transaction()
    for (const order of orders) {
      const next = deriveOrderV2Input(order)
      tx.patch(order._id, {set: {orderV2: next}})
    }

    await tx.commit({autoGenerateArrayKeys: true})
    processed += orders.length
    offset += BATCH_SIZE
    console.log(`Backfilled ${processed} orders`)
  }

  console.log('Order v2 backfill complete')
}

run().catch((err) => {
  console.error('Backfill failed', err)
  process.exit(1)
})
