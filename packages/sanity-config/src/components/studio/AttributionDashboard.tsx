import {useClient} from 'sanity'
import {useEffect, useMemo, useState} from 'react'
import {Card, Flex, Grid, Spinner, Stack, Text, Button} from '@sanity/ui'
import {WarningOutlineIcon} from '@sanity/icons'
import {useRouter} from 'sanity/router'

type OrderAttribution = {
  source?: string
  medium?: string
  campaign?: string
}

type OrderSummary = {
  _id: string
  orderNumber?: string
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  currency?: string
  createdAt?: string
  attribution?: OrderAttribution | null
}

type QueryResult = {
  total: number
  paid: number
  orders: OrderSummary[]
}

const PAID_FILTER = '(status in ["paid","fulfilled","shipped"] || paymentStatus == "paid")'

const ATTRIBUTION_QUERY = `{
  "total": count(*[_type == "order"]),
  "paid": count(*[_type == "order" && ${PAID_FILTER}]),
  "orders": *[_type == "order" && ${PAID_FILTER}]{
    _id,
    orderNumber,
    totalAmount,
    amountSubtotal,
    amountTax,
    currency,
    createdAt,
    attribution
  } | order(dateTime(coalesce(createdAt, _createdAt)) desc)[0...200]
}`

const StatCard = ({
  label,
  value,
  tone = 'primary',
}: {
  label: string
  value: string | number
  tone?: 'primary' | 'positive' | 'caution'
}) => (
  <Card padding={4} radius={2} tone={tone === 'caution' ? 'caution' : undefined} border shadow={1}>
    <Stack space={2}>
      <Text size={1} muted>
        {label}
      </Text>
      <Text size={3} weight="semibold">
        {value}
      </Text>
    </Stack>
  </Card>
)

const amountForOrder = (order: OrderSummary): number => {
  if (typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount)) {
    return order.totalAmount
  }
  const subtotal = Number.isFinite(order.amountSubtotal) ? Number(order.amountSubtotal) : 0
  const tax = Number.isFinite(order.amountTax) ? Number(order.amountTax) : 0
  return subtotal + tax
}

export default function AttributionDashboard() {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const [data, setData] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await client.fetch<QueryResult>(ATTRIBUTION_QUERY)
      setData(result)
    } catch (err) {
      console.error('AttributionDashboard: failed to load data', err)
      setError(err instanceof Error ? err.message : 'Failed to load attribution data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const attributedOrders = useMemo(() => {
    if (!data?.orders) return []
    return data.orders.filter((order) => {
      const source = order.attribution?.source
      return typeof source === 'string' && source.trim().length > 0
    })
  }, [data])

  const unattributedCount = useMemo(() => {
    if (!data) return 0
    return Math.max(0, (data.paid || 0) - attributedOrders.length)
  }, [data, attributedOrders])

  const sourceStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        count: number
        revenue: number
      }
    >()
    attributedOrders.forEach((order) => {
      const source = order.attribution?.source || 'unknown'
      const amount = amountForOrder(order)
      const existing = stats.get(source) || {count: 0, revenue: 0}
      existing.count += 1
      existing.revenue += amount
      stats.set(source, existing)
    })
    return Array.from(stats.entries()).sort((a, b) => b[1].revenue - a[1].revenue)
  }, [attributedOrders])

  const campaignStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        count: number
        revenue: number
      }
    >()
    attributedOrders.forEach((order) => {
      const campaign = order.attribution?.campaign || 'uncategorized'
      const amount = amountForOrder(order)
      const existing = stats.get(campaign) || {count: 0, revenue: 0}
      existing.count += 1
      existing.revenue += amount
      stats.set(campaign, existing)
    })
    return Array.from(stats.entries()).sort((a, b) => b[1].revenue - a[1].revenue)
  }, [attributedOrders])

  const recentOrders = attributedOrders.slice(0, 10)

  return (
    <Stack space={4}>
      <Flex align="center" justify="space-between">
        <Stack space={2}>
          <Text size={3} weight="semibold">
            Attribution Overview
          </Text>
          <Text size={1} muted>
            Understand which channels and campaigns are driving revenue.
          </Text>
        </Stack>
        <Button text="Refresh" mode="bleed" onClick={load} disabled={loading} />
      </Flex>

      {loading && (
        <Card padding={4} radius={2} tone="primary" border>
          <Flex align="center" gap={3}>
            <Spinner />
            <Text>Loading attribution data…</Text>
          </Flex>
        </Card>
      )}

      {error && (
        <Card padding={4} radius={2} tone="critical" border>
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <>
          <Grid columns={[1, 2, 4]} gap={4}>
            <StatCard label="Total Orders" value={data.total} />
            <StatCard label="Paid Orders" value={data.paid} />
            <StatCard
              label="Attributed (Paid)"
              value={attributedOrders.length}
              tone="positive"
            />
            <StatCard label="Unattributed (Paid)" value={unattributedCount} tone="caution" />
          </Grid>

          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Flex align="center" gap={2}>
                <Text weight="semibold">Top Sources ({sourceStats.length})</Text>
              </Flex>
              {sourceStats.length === 0 && <Text size={1}>No attributed orders yet.</Text>}
              <Stack as="ul" space={2} style={{listStyle: 'none', margin: 0, padding: 0}}>
                {sourceStats.slice(0, 6).map(([source, stat]) => (
                  <Flex
                    key={source}
                    as="li"
                    justify="space-between"
                    style={{borderBottom: '1px solid var(--card-border-color)', paddingBottom: 6}}
                  >
                    <Text weight="medium">{source}</Text>
                    <Text size={1}>
                      {stat.count} orders • ${stat.revenue.toFixed(2)}
                    </Text>
                  </Flex>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Flex align="center" gap={2}>
                <Text weight="semibold">Top Campaigns</Text>
              </Flex>
              {campaignStats.length === 0 && <Text size={1}>No campaign data captured yet.</Text>}
              <Stack as="ul" space={2} style={{listStyle: 'none', margin: 0, padding: 0}}>
                {campaignStats.slice(0, 6).map(([campaign, stat]) => (
                  <Flex key={campaign} as="li" justify="space-between" style={{paddingBottom: 6}}>
                    <Text weight="medium">{campaign}</Text>
                    <Text size={1}>
                      {stat.count} orders • ${stat.revenue.toFixed(2)}
                    </Text>
                  </Flex>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Flex align="center" gap={2}>
                <WarningOutlineIcon />
                <Text weight="semibold">Recent Attributed Orders</Text>
              </Flex>
              {recentOrders.length === 0 && <Text size={1}>No attributed orders yet.</Text>}
              <Stack space={3}>
                {recentOrders.map((order) => (
                  <Flex
                    key={order._id}
                    justify="space-between"
                    style={{borderBottom: '1px solid var(--card-border-color)', paddingBottom: 8}}
                  >
                    <Stack space={1}>
                      <Text weight="medium">
                        {order.orderNumber || `Order ${order._id.slice(-6)}`}
                      </Text>
                      <Text size={1} muted>
                        {order.attribution?.source || 'unknown'} • {order.attribution?.campaign || 'No campaign'}
                      </Text>
                    </Stack>
                    <Flex align="center" gap={2}>
                      <Text size={1} weight="semibold">
                        ${amountForOrder(order).toFixed(2)}
                      </Text>
                      <Button
                        text="Open"
                        tone="primary"
                        mode="ghost"
                        onClick={() => router.navigateIntent('edit', {id: order._id, type: 'order'})}
                      />
                    </Flex>
                  </Flex>
                ))}
              </Stack>
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}
