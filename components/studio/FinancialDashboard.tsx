import React, {useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {Card, Stack, Text, Heading, Flex, Box} from '@sanity/ui'

const DAY = 24 * 60 * 60 * 1000

type ProductMetric = {
  name: string
  count: number
}

type MetricsState = {
  ordersLast30: number
  revenueLast90: number
  avgOrderValue: number
  topProducts: ProductMetric[]
  source: 'orders' | 'invoices' | 'none'
}

type OrderDocument = {
  _createdAt?: string
  createdAt?: string
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  amountShipping?: number
  status?: string
  cart?: Array<{name?: string; sku?: string; quantity?: number}>
}

type InvoiceDocument = {
  _createdAt?: string
  status?: string
  total?: number
  amount?: number
  amountSubtotal?: number
  amountTax?: number
  lineItems?: Array<{quantity?: number; product?: {title?: string}; description?: string}>
}

function parseDate(value?: string): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function getOrderTotal(order: OrderDocument): number {
  const direct = Number(order.totalAmount)
  const subtotal = Number(order.amountSubtotal) || 0
  const tax = Number(order.amountTax) || 0
  const shipping = Number(order.amountShipping) || 0
  const composed = subtotal + tax + shipping

  if (Number.isFinite(direct) && direct > 0) {
    if (composed > 0 && direct / composed >= 50) {
      return composed
    }
    if (direct >= 100000 && composed === 0) {
      return direct / 100
    }
    return direct
  }

  if (composed > 0) return composed
  return 0
}

function computeOrderMetrics(orders: OrderDocument[]): MetricsState {
  const now = Date.now()
  const thirtyAgo = now - 30 * DAY
  const ninetyAgo = now - 90 * DAY

  let ordersLast30 = 0
  let revenueLast90 = 0
  let revenueOrderCount = 0
  const productCounts = new Map<string, number>()

  orders.forEach((order) => {
    if ((order.status || '').toLowerCase() === 'cancelled') return
    const createdTs = parseDate(order.createdAt) || parseDate(order._createdAt)
    if (!createdTs) return

    if (createdTs >= thirtyAgo) {
      ordersLast30 += 1
    }

    if (createdTs >= ninetyAgo) {
      const total = getOrderTotal(order)
      revenueLast90 += total
      revenueOrderCount += 1

      order.cart?.forEach((item) => {
        const name = item?.name || item?.sku || 'Unknown Product'
        const qty = Number(item?.quantity) || 1
        productCounts.set(name, (productCounts.get(name) || 0) + qty)
      })
    }
  })

  const avgOrderValue = revenueOrderCount > 0 ? revenueLast90 / revenueOrderCount : 0

  const topProducts = Array.from(productCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({name, count}))

  return {
    ordersLast30,
    revenueLast90,
    avgOrderValue,
    topProducts,
    source: revenueOrderCount > 0 || ordersLast30 > 0 ? 'orders' : 'none'
  }
}

function computeInvoiceMetrics(invoices: InvoiceDocument[]): MetricsState {
  const now = Date.now()
  const thirtyAgo = now - 30 * DAY
  const ninetyAgo = now - 90 * DAY

  let ordersLast30 = 0
  let revenueLast90 = 0
  let revenueOrderCount = 0
  const productCounts = new Map<string, number>()

  invoices.forEach((invoice) => {
    if ((invoice.status || '').toLowerCase() === 'cancelled') return
    const createdTs = parseDate(invoice._createdAt)
    if (!createdTs) return

    if (createdTs >= thirtyAgo) {
      ordersLast30 += 1
    }

    if (createdTs >= ninetyAgo) {
      const direct = Number(invoice.total ?? invoice.amount)
      const subtotal = Number(invoice.amountSubtotal) || 0
      const tax = Number(invoice.amountTax) || 0
      let total = 0
      if (Number.isFinite(direct) && direct > 0) total = direct
      else total = subtotal + tax
      if (total >= 100000) total = total / 100
      revenueLast90 += total
      revenueOrderCount += 1

      invoice.lineItems?.forEach((item) => {
        const label = item?.product?.title || item?.description || 'Line Item'
        const qty = Number(item?.quantity) || 1
        productCounts.set(label, (productCounts.get(label) || 0) + qty)
      })
    }
  })

  const avgOrderValue = revenueOrderCount > 0 ? revenueLast90 / revenueOrderCount : 0

  const topProducts = Array.from(productCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({name, count}))

  return {
    ordersLast30,
    revenueLast90,
    avgOrderValue,
    topProducts,
    source: revenueOrderCount > 0 || ordersLast30 > 0 ? 'invoices' : 'none'
  }
}

export default function FinancialDashboard() {
  const client = useClient({apiVersion: '2024-04-10'})
  const [metrics, setMetrics] = useState<MetricsState>({
    ordersLast30: 0,
    revenueLast90: 0,
    avgOrderValue: 0,
    topProducts: [],
    source: 'none'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const orders: OrderDocument[] = await client.fetch(
          `*[_type == "order" && dateTime(coalesce(createdAt, _createdAt)) >= dateTime($start)]{
            _createdAt,
            createdAt,
            totalAmount,
            amountSubtotal,
            amountTax,
            amountShipping,
            status,
            cart[]{name, sku, quantity}
          }`,
          {start: new Date(Date.now() - 120 * DAY).toISOString()}
        )

        let nextMetrics = computeOrderMetrics(orders)

        if (nextMetrics.source === 'none') {
          const invoices: InvoiceDocument[] = await client.fetch(
            `*[_type == "invoice" && dateTime(_createdAt) >= dateTime($start) && (defined(total) || defined(amount) || defined(amountSubtotal))]{
              _createdAt,
              status,
              total,
              amount,
              amountSubtotal,
              amountTax,
              lineItems[]{quantity, description, product->{title}}
            }`,
            {start: new Date(Date.now() - 120 * DAY).toISOString()}
          )

          nextMetrics = computeInvoiceMetrics(invoices)
        }

        if (!cancelled) {
          setMetrics(nextMetrics)
        }
      } catch (err) {
        console.error('Financial dashboard metrics failed', err)
        if (!cancelled) setError('Failed to load financial metrics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [client])

  return (
    <Card padding={4} radius={3} shadow={1}>
      <Heading size={2}>📊 Financial Snapshot</Heading>
      {loading ? (
        <Text>Loading...</Text>
      ) : error ? (
        <Text style={{ color: 'red' }}>{error}</Text>
      ) : (
        <Stack space={6} marginTop={5}>
          <Flex gap={6} wrap="wrap">
            <Box flex={1} style={{ minWidth: 250 }}>
              <Text size={1} weight="semibold" style={{ marginBottom: 10 }}>🧾 Orders (Last 30 Days)</Text>
              <Text size={3}>{metrics.ordersLast30}</Text>
            </Box>
            <Box flex={1} style={{ minWidth: 250 }}>
              <Text size={1} weight="semibold" style={{ marginBottom: 10 }}>💰 Revenue (Last 90 Days)</Text>
              <Text size={3}>${metrics.revenueLast90.toFixed(2)}</Text>
            </Box>
            <Box flex={1} style={{ minWidth: 250 }}>
              <Text size={1} weight="semibold" style={{ marginBottom: 10 }}>📈 Average Order Value</Text>
              <Text size={3}>${metrics.avgOrderValue.toFixed(2)}</Text>
            </Box>
          </Flex>

          <hr style={{ borderTop: '1px solid #333', margin: '1rem 0' }} />

          <Box>
            <Text size={1} weight="semibold">🏆 Top Products</Text>
            {metrics.topProducts.length === 0 ? (
              <Text size={1} muted style={{ marginTop: 12 }}>
                No product sales recorded in the last 90 days.
              </Text>
            ) : (
              <Stack marginTop={3} space={3}>
                {metrics.topProducts.map((product) => (
                  <Text key={product.name}>
                    • {product.name} (×{product.count})
                  </Text>
                ))}
              </Stack>
            )}
            <Text size={1} muted style={{ marginTop: 16 }}>
              Data source: {metrics.source === 'orders' ? 'Orders' : metrics.source === 'invoices' ? 'Invoices' : 'No recent records'}
            </Text>
          </Box>
        </Stack>
      )}
    </Card>
  )
}
