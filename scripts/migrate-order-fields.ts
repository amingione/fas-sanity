#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const resolved = path.resolve(process.cwd(), filename)
  if (fs.existsSync(resolved)) {
    dotenv.config({path: resolved, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('migrate-order-fields: Missing SANITY_STUDIO_PROJECT_ID/SANITY_STUDIO_DATASET/SANITY_API_TOKEN')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

type OrderDoc = {
  _id: string
  carrier?: string | null
  service?: string | null
  deliveryDays?: number | null
  estimatedDeliveryDate?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  shippingCarrier?: string | null
  shippingServiceName?: string | null
  shippingServiceCode?: string | null
  shippingEstimatedDeliveryDate?: string | null
  shippingDeliveryDays?: number | null
  selectedService?: {
    carrier?: string | null
    service?: string | null
    estimatedDeliveryDate?: string | null
    deliveryDays?: number | null
  } | null
  fulfillment?: {
    carrier?: string | null
    service?: string | null
    deliveryDays?: number | null
    estimatedDeliveryDate?: string | null
    shippedAt?: string | null
    deliveredAt?: string | null
    trackingNumber?: string | null
    trackingUrl?: string | null
    shippingAddress?: Record<string, unknown> | null
  } | null
}

const pickString = (...values: Array<string | null | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

const pickNumber = (...values: Array<number | null | undefined>): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

const hasValue = (order: OrderDoc, path: string): boolean => {
  const segments = path.split('.')
  let current: any = order
  for (const segment of segments) {
    if (current == null) return false
    current = current[segment]
  }
  if (Array.isArray(current)) return current.length > 0
  if (typeof current === 'number') return Number.isFinite(current)
  if (typeof current === 'boolean') return true
  if (typeof current === 'string') return current.trim().length > 0
  return Boolean(current)
}

async function migrateOrders() {
  console.log('migrate-order-fields: Fetching orders...')
  const orders = await client.fetch<OrderDoc[]>(
    `*[_type == "order"]{
      _id,
      carrier,
      service,
      deliveryDays,
      estimatedDeliveryDate,
      shippedAt,
      deliveredAt,
      trackingNumber,
      trackingUrl,
      shippingCarrier,
      shippingServiceName,
      shippingServiceCode,
      shippingEstimatedDeliveryDate,
      shippingDeliveryDays,
      selectedService,
      fulfillment
    }`,
  )

  console.log(`migrate-order-fields: Found ${orders.length} order(s)`)

  const patches: Array<{id: string; set?: Record<string, unknown>; unset?: string[]}> = []

  for (const order of orders) {
    const setOps: Record<string, unknown> = {}
    const unsetOps: string[] = []

    const carrier = pickString(order.carrier, order.shippingCarrier, order.selectedService?.carrier, order.fulfillment?.carrier)
    const service = pickString(order.service, order.shippingServiceName, order.selectedService?.service, order.fulfillment?.service)
    const estimatedDeliveryDate = pickString(
      order.estimatedDeliveryDate,
      order.shippingEstimatedDeliveryDate,
      order.selectedService?.estimatedDeliveryDate,
      order.fulfillment?.estimatedDeliveryDate,
    )
    const deliveryDays =
      pickNumber(order.deliveryDays, order.shippingDeliveryDays, order.selectedService?.deliveryDays, order.fulfillment?.deliveryDays) ??
      undefined
    const shippedAt = order.shippedAt || order.fulfillment?.shippedAt || undefined
    const deliveredAt = order.deliveredAt || order.fulfillment?.deliveredAt || undefined
    const trackingNumber = order.trackingNumber || order.fulfillment?.trackingNumber || undefined
    const trackingUrl = order.trackingUrl || order.fulfillment?.trackingUrl || undefined

    if (carrier && carrier !== order.carrier) setOps.carrier = carrier
    if (service && service !== order.service) setOps.service = service
    if (estimatedDeliveryDate && estimatedDeliveryDate !== order.estimatedDeliveryDate) {
      setOps.estimatedDeliveryDate = estimatedDeliveryDate
    }
    if (typeof deliveryDays === 'number' && order.deliveryDays !== deliveryDays) {
      setOps.deliveryDays = deliveryDays
    }
    if (shippedAt && shippedAt !== order.shippedAt) setOps.shippedAt = shippedAt
    if (deliveredAt && deliveredAt !== order.deliveredAt) setOps.deliveredAt = deliveredAt
    if (trackingNumber && trackingNumber !== order.trackingNumber) {
      setOps.trackingNumber = trackingNumber
    }
    if (trackingUrl && trackingUrl !== order.trackingUrl) {
      setOps.trackingUrl = trackingUrl
    }

    const duplicateFields = [
      'selectedService',
      'shippingCarrier',
      'shippingDeliveryDays',
      'shippingEstimatedDeliveryDate',
      'shippingServiceName',
      'selectedShippingAmount',
      'selectedShippingCurrency',
      'shippingServiceCode',
      'shippingMetadata',
      'customer',
    ]
    for (const field of duplicateFields) {
      if (hasValue(order, field)) unsetOps.push(field)
    }
    if (order.fulfillment?.shippingAddress) {
      unsetOps.push('fulfillment.shippingAddress')
    }
    const legacyFulfillmentFields = [
      'fulfillment.carrier',
      'fulfillment.service',
      'fulfillment.trackingNumber',
      'fulfillment.trackingUrl',
      'fulfillment.deliveryDays',
      'fulfillment.estimatedDeliveryDate',
    ]
    for (const field of legacyFulfillmentFields) {
      if (hasValue(order, field)) unsetOps.push(field)
    }

    if (Object.keys(setOps).length === 0 && unsetOps.length === 0) continue

    patches.push({
      id: order._id,
      set: Object.keys(setOps).length ? setOps : undefined,
      unset: unsetOps.length ? unsetOps : undefined,
    })
  }

  console.log(
    `migrate-order-fields: Prepared ${patches.length} mutation(s)${
      patches.length ? ' (batched by 10)' : ''
    }`,
  )
  const batchSize = 10
  for (let i = 0; i < patches.length; i += batchSize) {
    const batch = patches.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const patch of batch) {
      tx.patch(patch.id, (builder) => {
        let next = builder
        if (patch.set) next = next.set(patch.set)
        if (patch.unset) next = next.unset(patch.unset)
        return next
      })
    }
    await tx.commit({autoGenerateArrayKeys: true})
    console.log(
      `migrate-order-fields: Committed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(patches.length / batchSize)}`,
    )
  }

  console.log('migrate-order-fields: Complete')
}

migrateOrders().catch((err) => {
  console.error('migrate-order-fields: Failed', err)
  process.exit(1)
})
