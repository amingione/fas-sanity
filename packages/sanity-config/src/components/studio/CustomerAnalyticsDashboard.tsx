import {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Badge,
  Card,
  Flex,
  Grid,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {format} from 'date-fns'

type SegmentRecord = {
  segment?: string | null
  lifetimeValue?: number | null
  daysSinceLastOrder?: number | null
}

type CustomerRecord = {
  _id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  lifetimeValue?: number | null
  totalOrders?: number | null
  lastOrderDate?: string | null
  segment?: string | null
}

type RecentCustomerRecord = {
  _createdAt: string
  marketingSource?: string | null
}

type RetentionMetrics = {
  totalCustomers: number
  repeatCustomers: number
  avgDaysBetweenOrders?: number | null
  inactiveCustomers?: number | null
}

type AnalyticsResponse = {
  segments: SegmentRecord[]
  topCustomers: CustomerRecord[]
  recentCustomers: RecentCustomerRecord[]
  retention: RetentionMetrics
}

const API_VERSION = '2024-10-01'
const CUSTOMER_ANALYTICS_QUERY = `{
  "segments": *[_type == "customer" && !(_id in path("drafts.**"))]{
    segment,
    lifetimeValue,
    daysSinceLastOrder
  },
  "topCustomers": *[_type == "customer" && !(_id in path("drafts.**"))] | order(coalesce(lifetimeValue, 0) desc)[0...20]{
    _id,
    firstName,
    lastName,
    email,
    lifetimeValue,
    totalOrders,
    lastOrderDate,
    segment
  },
  "recentCustomers": *[_type == "customer" && !(_id in path("drafts.**")) && _createdAt >= $oneYearAgo] | order(_createdAt asc){
    _createdAt,
    "marketingSource": emailMarketing.source
  },
  "retention": {
    "totalCustomers": count(*[_type == "customer" && !(_id in path("drafts.**"))]),
    "repeatCustomers": count(*[_type == "customer" && !(_id in path("drafts.**")) && totalOrders > 1]),
    "avgDaysBetweenOrders": avg(*[_type == "customer" && !(_id in path("drafts.**")) && totalOrders > 1].((lastOrderDate - firstOrderDate) / (totalOrders - 1))),
    "inactiveCustomers": count(*[_type == "customer" && !(_id in path("drafts.**")) && segment == "inactive"])
  }
}`

const SEGMENT_LABELS: Record<string, string> = {
  vip: '💎 VIP',
  repeat: '🔁 Repeat',
  new: '🆕 New',
  at_risk: '⚠️ At Risk',
  inactive: '😴 Inactive',
  active: '✅ Active',
}

const formatCurrency = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0}).format(value)
    : '$0'

const CustomerAnalyticsDashboard = () => {
  const client = useClient({apiVersion: API_VERSION})
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    client
      .fetch<AnalyticsResponse>(CUSTOMER_ANALYTICS_QUERY, {
        oneYearAgo: oneYearAgo.toISOString(),
      })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Customer analytics query failed', err)
          setError(err instanceof Error ? err.message : 'Unable to load analytics')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client])

  const segmentBreakdown = useMemo(() => {
    const base = {
      vip: {count: 0, revenue: 0},
      repeat: {count: 0, revenue: 0},
      new: {count: 0, revenue: 0},
      at_risk: {count: 0, revenue: 0},
      inactive: {count: 0, revenue: 0},
      active: {count: 0, revenue: 0},
    }
    data?.segments.forEach((record) => {
      const key = (record.segment as keyof typeof base) || 'active'
      if (!base[key]) return
      base[key].count += 1
      base[key].revenue += record.lifetimeValue || 0
    })
    return base
  }, [data?.segments])

  const monthlyNewCustomers = useMemo(() => {
    const buckets = new Map<string, {count: number; order: number}>()
    data?.recentCustomers.forEach((record) => {
      const date = new Date(record._createdAt)
      const key = format(date, 'MMM yyyy')
      const existing = buckets.get(key) || {count: 0, order: date.getTime()}
      buckets.set(key, {count: existing.count + 1, order: existing.order})
    })
    return Array.from(buckets.entries())
      .map(([label, meta]) => ({label, count: meta.count, order: meta.order}))
      .sort((a, b) => a.order - b.order)
      .slice(-12)
  }, [data?.recentCustomers])

  const acquisitionSources = useMemo(() => {
    const buckets = new Map<string, number>()
    data?.recentCustomers.forEach((record) => {
      const key = record.marketingSource || 'unknown'
      buckets.set(key, (buckets.get(key) || 0) + 1)
    })
    return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1])
  }, [data?.recentCustomers])

  const retention = data?.retention
  const repeatRate =
    retention && retention.totalCustomers > 0
      ? Number(((retention.repeatCustomers / retention.totalCustomers) * 100).toFixed(1))
      : 0
  const churnRate =
    retention && retention.totalCustomers > 0 && typeof retention.inactiveCustomers === 'number'
      ? Number(((retention.inactiveCustomers / retention.totalCustomers) * 100).toFixed(1))
      : 0

  return (
    <Stack space={4} padding={4}>
      {loading && (
        <Flex gap={3} align="center">
          <Spinner muted />
          <Text muted>Loading customer analytics…</Text>
        </Flex>
      )}
      {error && (
        <Card padding={3} tone="critical" radius={2}>
          <Text size={1}>{error}</Text>
        </Card>
      )}

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Customer Segments
          </Text>
          <Grid columns={[1, 2, 3]} gap={3}>
            {Object.entries(segmentBreakdown).map(([segment, info]) => (
              <Card key={segment} padding={3} border radius={2} tone="transparent">
                <Stack space={1}>
                  <Text weight="semibold">{SEGMENT_LABELS[segment] || segment}</Text>
                  <Text size={1} muted>
                    {info.count} customers
                  </Text>
                  <Text size={1} muted>
                    {formatCurrency(info.revenue)} lifetime value
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        </Stack>
      </Card>

      <Grid columns={[1, 2]} gap={4}>
        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Top Customers
            </Text>
            {data?.topCustomers?.length ? (
              <Stack space={2}>
                {data.topCustomers.slice(0, 8).map((customer) => (
                  <Card key={customer._id} padding={3} radius={2} border>
                    <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
                      <Stack space={1}>
                        <Text weight="semibold">
                          {[customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
                            customer.email ||
                            'Customer'}
                        </Text>
                        <Text size={1} muted>
                          {customer.totalOrders || 0} orders
                        </Text>
                      </Stack>
                      <Stack space={1} style={{textAlign: 'right'}}>
                        <Text weight="semibold">{formatCurrency(customer.lifetimeValue)}</Text>
                        {customer.segment && (
                          <Badge mode="outline">
                            {SEGMENT_LABELS[customer.segment] || customer.segment}
                          </Badge>
                        )}
                      </Stack>
                    </Flex>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Text size={1} muted>
                No customers to display yet.
              </Text>
            )}
          </Stack>
        </Card>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Customer Acquisition
            </Text>
            <Stack space={2}>
              <Text size={1} muted>
                New customers by month
              </Text>
              {monthlyNewCustomers.length ? (
                <Stack space={1}>
                  {monthlyNewCustomers.map((entry) => (
                    <Flex key={entry.label} justify="space-between">
                      <Text>{entry.label}</Text>
                      <Text weight="semibold">{entry.count}</Text>
                    </Flex>
                  ))}
                </Stack>
              ) : (
                <Text size={1} muted>
                  Not enough data for trends yet.
                </Text>
              )}
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Acquisition sources
              </Text>
              {acquisitionSources.length ? (
                <Stack space={1}>
                  {acquisitionSources.map(([source, count]) => (
                    <Flex key={source} justify="space-between">
                      <Text>{source}</Text>
                      <Text weight="semibold">{count}</Text>
                    </Flex>
                  ))}
                </Stack>
              ) : (
                <Text size={1} muted>
                  No source data recorded.
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
      </Grid>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Retention Metrics
          </Text>
          <Grid columns={[1, 2, 2, 4]} gap={3}>
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>
                Total customers
              </Text>
              <Text size={3} weight="semibold">
                {retention?.totalCustomers ?? 0}
              </Text>
            </Card>
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>
                Repeat rate
              </Text>
              <Text size={3} weight="semibold">{repeatRate}%</Text>
              <Text size={1} muted>({retention?.repeatCustomers ?? 0})</Text>
            </Card>
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>
                Churn rate
              </Text>
              <Text size={3} weight="semibold">{churnRate}%</Text>
              <Text size={1} muted>({retention?.inactiveCustomers ?? 0})</Text>
            </Card>
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>
                Avg. days between orders
              </Text>
              <Text size={3} weight="semibold">
                {retention?.avgDaysBetweenOrders
                  ? Math.round(retention.avgDaysBetweenOrders / (1000 * 60 * 60 * 24))
                  : '—'}
              </Text>
            </Card>
          </Grid>
        </Stack>
      </Card>
    </Stack>
  )
}

export default CustomerAnalyticsDashboard
