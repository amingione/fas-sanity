#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {
  GROQ_FILTER_EXCLUDE_CANCELLED_REFUNDED,
  GROQ_FILTER_EXCLUDE_EXPIRED,
  isCanceledOrRefundedOrder,
} from '../packages/sanity-config/src/utils/orderFilters'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']

for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''
const SANITY_STUDIO_DATASET = process.env.SANITY_STUDIO_DATASET || 'production'
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN || ''
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'

if (!SANITY_STUDIO_PROJECT_ID || !SANITY_API_TOKEN) {
  console.error('Missing SANITY_STUDIO_PROJECT_ID or SANITY_API_TOKEN environment variables')
  process.exit(1)
}

const sanity = createClient({
  projectId: SANITY_STUDIO_PROJECT_ID,
  dataset: SANITY_STUDIO_DATASET,
  apiVersion: API_VERSION,
  token: SANITY_API_TOKEN,
  useCdn: false,
})

type OrderSummary = {
  _id: string
  status?: string | null
  paymentStatus?: string | null
  totalAmount?: number | string | null
  total?: number | string | null
  amountSubtotal?: number | string | null
  amountTax?: number | string | null
  amountShipping?: number | string | null
  amountDiscount?: number | string | null
  createdAt?: string | null
  _createdAt?: string
}

type CustomerDoc = {_id: string}

const ORDER_QUERY = `*[_type == "order" && customerRef._ref == $customerId && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && (${GROQ_FILTER_EXCLUDE_CANCELLED_REFUNDED})]{
  _id,
  status,
  paymentStatus,
  totalAmount,
  total,
  amountSubtotal,
  amountTax,
  amountShipping,
  amountDiscount,
  createdAt,
  _createdAt
} | order(dateTime(coalesce(createdAt, _createdAt)) asc)`

const CUSTOMERS_QUERY = '*[_type == "customer" && !(_id in path("drafts.**"))]{_id}'

const MS_PER_DAY = 86_400_000

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const formatDate = (value?: string | null): string | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

const computeOrderTotal = (order: OrderSummary): number => {
  const total =
    toNumber(order.totalAmount) ??
    toNumber(order.total) ??
    (() => {
      const subtotal = toNumber(order.amountSubtotal) ?? 0
      const tax = toNumber(order.amountTax) ?? 0
      const shipping = toNumber(order.amountShipping) ?? 0
      const discount = toNumber(order.amountDiscount) ?? 0
      return subtotal + tax + shipping - discount
    })()
  return Number.isFinite(total) ? total : 0
}

const getOrderTimestamp = (order: OrderSummary): string | null =>
  order.createdAt || order._createdAt || null

async function fetchCustomers(): Promise<CustomerDoc[]> {
  return sanity.fetch(CUSTOMERS_QUERY)
}

async function fetchOrders(customerId: string): Promise<OrderSummary[]> {
  return sanity.fetch(ORDER_QUERY, {customerId})
}

async function main() {
  const customers = await fetchCustomers()
  console.log(`Found ${customers.length} customer documents`)

  let updated = 0
  let skipped = 0

  for (const customer of customers) {
    const orders = (await fetchOrders(customer._id)).filter(
      (order) => !isCanceledOrRefundedOrder(order),
    )

    if (!orders.length) {
      await sanity
        .patch(customer._id)
        .set({
          totalOrders: 0,
          orderCount: 0,
          firstOrderDate: null,
          lastOrderDate: null,
          daysSinceLastOrder: null,
          averageOrderValue: null,
          lifetimeValue: null,
        })
        .commit()
      updated++
      continue
    }

    const totals = orders.map((order) => ({
      total: computeOrderTotal(order),
      ts: getOrderTimestamp(order),
    }))

    const totalOrders = totals.length
    const firstOrderDate = formatDate(totals[0]?.ts)
    const lastOrderDate = formatDate(totals[totals.length - 1]?.ts)
    const lifetimeValueRaw = totals.reduce((sum, entry) => sum + (entry.total || 0), 0)
    const lifetimeValue = Number(lifetimeValueRaw.toFixed(2))
    const averageOrderValue = Number((lifetimeValue / totalOrders).toFixed(2))

    const last = lastOrderDate ? new Date(lastOrderDate) : null
    const daysSinceLastOrder =
      last && Number.isFinite(last.getTime())
        ? Math.floor((Date.now() - last.getTime()) / MS_PER_DAY)
        : null

    await sanity
      .patch(customer._id)
      .set({
        totalOrders,
        orderCount: totalOrders,
        firstOrderDate,
        lastOrderDate,
        daysSinceLastOrder,
        averageOrderValue,
        lifetimeValue,
      })
      .commit()

    updated++
  }

  console.log(`Updated ${updated} customers, skipped ${skipped}`)

  const verification = await sanity.fetch<
    Array<{_id: string; firstOrderDate?: string; lastOrderDate?: string; totalOrders?: number}>
  >(
    '*[_type == "customer" && totalOrders > 1 && defined(lastOrderDate) && defined(firstOrderDate)]{_id, firstOrderDate, lastOrderDate, totalOrders}',
  )

  console.log(`Verification query matched ${verification.length} customers`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
