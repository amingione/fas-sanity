import {useEffect, useMemo, useState} from 'react'
import {Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {useClient, useFormValue} from 'sanity'

type ProductOrder = {
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  currency?: string
  attribution?: {
    source?: string
    campaign?: string
  }
}

const PAID_FILTER = '(status in ["paid","fulfilled","shipped"] || paymentStatus == "paid")'

const PRODUCT_ATTRIBUTION_QUERY = `
*[_type == "order" && ${PAID_FILTER} && defined(attribution.source) && count(cart[productRef._ref == $productId]) > 0]{
  totalAmount,
  amountSubtotal,
  amountTax,
  currency,
  attribution
}
`

const resolveAmount = (order: ProductOrder): number => {
  if (typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount)) {
    return order.totalAmount
  }
  const subtotal = Number.isFinite(order.amountSubtotal) ? Number(order.amountSubtotal) : 0
  const tax = Number.isFinite(order.amountTax) ? Number(order.amountTax) : 0
  return subtotal + tax
}

export default function ProductMarketingInsights() {
  const rawId = useFormValue(['_id']) as string | undefined
  const productId = rawId ? rawId.replace(/^drafts\./, '') : undefined
  const client = useClient({apiVersion: '2024-10-01'})
  const [orders, setOrders] = useState<ProductOrder[] | null>(null)
  const [loading, setLoading] = useState(false)
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }),
    [],
  )

  useEffect(() => {
    if (!productId) {
      setOrders(null)
      return
    }
    setLoading(true)
    client
      .fetch<ProductOrder[]>(PRODUCT_ATTRIBUTION_QUERY, {productId})
      .then((docs) => setOrders(Array.isArray(docs) ? docs : []))
      .catch((err) => {
        console.warn('ProductMarketingInsights: failed to load stats', err)
        setOrders([])
      })
      .finally(() => setLoading(false))
  }, [productId, client])

  const stats = useMemo(() => {
    if (!orders) return null
    const totalRevenue = orders.reduce((sum, order) => sum + resolveAmount(order), 0)
    const sourceMap = new Map<string, {count: number; revenue: number}>()
    orders.forEach((order) => {
      const key = (order.attribution?.source || 'unknown').toLowerCase()
      const existing = sourceMap.get(key) || {count: 0, revenue: 0}
      existing.count += 1
      existing.revenue += resolveAmount(order)
      sourceMap.set(key, existing)
    })
    const topSources = Array.from(sourceMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue)
    return {
      orders: orders.length,
      revenue: totalRevenue,
      topSources,
    }
  }, [orders])

  if (!productId) {
    return (
      <Card padding={4} radius={2} tone="caution" border>
        <Text size={1}>Save the product before viewing marketing insights.</Text>
      </Card>
    )
  }

  if (loading || !stats) {
    return (
      <Card padding={4} radius={2} border>
        <Flex align="center" gap={3}>
          <Spinner muted />
          <Text size={1}>Loading marketing performance…</Text>
        </Flex>
      </Card>
    )
  }

  return (
    <Card padding={4} radius={2} border>
      <Stack space={3}>
        <Text weight="semibold">Marketing Performance</Text>
        <Text size={1} muted>
          Orders attributed to this product across channels.
        </Text>
        <Flex justify="space-between">
          <Stack>
            <Text size={1} muted>
              Orders
            </Text>
            <Text size={3} weight="semibold">
              {stats.orders}
            </Text>
          </Stack>
          <Stack style={{textAlign: 'right'}}>
            <Text size={1} muted>
              Revenue
            </Text>
            <Text size={3} weight="semibold">
              {currencyFormatter.format(stats.revenue)}
            </Text>
          </Stack>
        </Flex>
        <Stack space={2}>
          <Text size={1} muted>
            Top Sources
          </Text>
          {stats.topSources.slice(0, 3).map(([source, data]) => (
            <Flex key={source} justify="space-between">
              <Text weight="medium">{source}</Text>
              <Text size={1}>
                {data.count} orders • {currencyFormatter.format(data.revenue)}
              </Text>
            </Flex>
          ))}
          {stats.topSources.length === 0 && <Text size={1}>No attributed orders yet.</Text>}
        </Stack>
      </Stack>
    </Card>
  )
}
