import {useEffect, useMemo, useState} from 'react'
import {Card, Stack, Flex, Box, Text, Badge, Spinner} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

type OrderSummary = {
  _id: string
  _createdAt: string
  orderNumber?: string
  customerName?: string
  totalAmount?: number
  status?: string
}

type Metrics = {
  totalRevenue: number
  todayRevenue: number
  monthRevenue: number
  totalOrders: number
  recentOrders: OrderSummary[]
}

const formatCurrency = (value?: number) =>
  new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0}).format(
    value || 0,
  )

const metricBadgeTone = (status?: string) => {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'completed') return 'positive'
  if (normalized === 'pending') return 'caution'
  return 'primary'
}

const parseDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function StripeAnalyticsWidget() {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  const {todayStart, tomorrowStart, monthStart, monthEnd} = useMemo(() => {
    const now = new Date()
    const tStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const tEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
    return {
      todayStart: tStart.toISOString(),
      tomorrowStart: tEnd.toISOString(),
      monthStart: mStart.toISOString(),
      monthEnd: mEnd.toISOString(),
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        const query = `{
          "totals": {
            "totalRevenue": coalesce(math::sum(*[_type == "order" && status == "completed"].totalAmount), 0),
            "todayRevenue": coalesce(math::sum(*[_type == "order" && status == "completed" && _createdAt >= $todayStart && _createdAt < $tomorrowStart].totalAmount), 0),
            "monthRevenue": coalesce(math::sum(*[_type == "order" && status == "completed" && _createdAt >= $monthStart && _createdAt < $monthEnd].totalAmount), 0),
            "totalOrders": count(*[_type == "order" && status == "completed"])
          },
          "recentOrders": *[_type == "order" && status == "completed"] | order(_createdAt desc) [0...10]{
            _id,
            _createdAt,
            orderNumber,
            customerName,
            totalAmount,
            status
          }
        }`

        const result = await client.fetch<{
          totals: Metrics
          recentOrders: OrderSummary[]
        }>(query, {
          todayStart,
          tomorrowStart,
          monthStart,
          monthEnd,
        })

        if (!mounted) return
        setMetrics({
          totalRevenue: result.totals?.totalRevenue || 0,
          todayRevenue: result.totals?.todayRevenue || 0,
          monthRevenue: result.totals?.monthRevenue || 0,
          totalOrders: result.totals?.totalOrders || 0,
          recentOrders: result.recentOrders || [],
        })
      } catch (err) {
        console.error('StripeAnalyticsWidget: failed to load metrics', err)
        if (!mounted) return
        setMetrics({
          totalRevenue: 0,
          todayRevenue: 0,
          monthRevenue: 0,
          totalOrders: 0,
          recentOrders: [],
        })
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchData()
    return () => {
      mounted = false
    }
  }, [client, todayStart, tomorrowStart, monthStart, monthEnd])

  if (loading || !metrics) {
    return (
      <Card padding={4} radius={3} shadow={1}>
        <Flex align="center" justify="center" gap={3}>
          <Spinner muted />
          <Text muted>Loading Stripe analytics…</Text>
        </Flex>
      </Card>
    )
  }

  return (
    <Card padding={4} radius={3} shadow={1}>
      <Stack space={4}>
        <Text size={2} weight="semibold">
          Stripe Analytics
        </Text>

        <Flex gap={3} wrap="wrap">
          <MetricCard label="Total revenue" value={formatCurrency(metrics.totalRevenue)} tone="primary" />
          <MetricCard label="Today" value={formatCurrency(metrics.todayRevenue)} tone="primary" />
          <MetricCard label="This month" value={formatCurrency(metrics.monthRevenue)} tone="primary" />
          <MetricCard label="Total orders" value={metrics.totalOrders.toLocaleString()} tone="primary" />
        </Flex>

        <Stack space={3}>
          <Text size={1} muted>
            Recent transactions
          </Text>
          <Stack space={2}>
            {metrics.recentOrders.map((order) => (
              <Card
                key={order._id}
                padding={3}
                radius={2}
                shadow={1}
                tone="transparent"
                style={{cursor: 'pointer'}}
                onClick={() => router.navigateIntent('edit', {id: order._id, type: 'order'})}
              >
                <Flex align="flex-start" justify="space-between" gap={3}>
                  <Stack space={1} flex={1}>
                    <Text weight="semibold">{order.orderNumber || 'Order'}</Text>
                    <Text size={1} muted>
                      {order.customerName || 'Customer'} • {parseDate(order._createdAt)}
                    </Text>
                  </Stack>
                  <Flex gap={2} align="center">
                    <Text weight="semibold">{formatCurrency(order.totalAmount || 0)}</Text>
                    <Badge mode="outline" tone={metricBadgeTone(order.status)} size={1}>
                      {order.status || '—'}
                    </Badge>
                  </Flex>
                </Flex>
              </Card>
            ))}
            {metrics.recentOrders.length === 0 && (
              <Card padding={3} radius={2} tone="transparent">
                <Text muted>No recent completed orders</Text>
              </Card>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Card>
  )
}

function MetricCard({label, value, tone}: {label: string; value: string; tone: 'primary'}) {
  return (
    <Card padding={3} radius={2} shadow={1} tone="transparent" style={{minWidth: 180, flex: 1}}>
      <Stack space={2}>
        <Text size={1} muted>
          {label}
        </Text>
        <Text size={3} weight="semibold" tone={tone}>
          {value}
        </Text>
      </Stack>
    </Card>
  )
}
