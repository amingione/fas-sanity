import {useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'
import {Box, Card, Flex, Grid, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {format} from 'date-fns'

type SegmentKey = 'activeSubscribers' | 'expiredCheckouts' | 'hasOrders'

type SegmentMetrics = {
  count: number
  lifetimeValue: number | null
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
  segmentTotals: Record<SegmentKey, SegmentMetrics>
  segmentCustomers: Record<SegmentKey, CustomerRecord[]>
  topCustomers: CustomerRecord[]
  recentCustomers: RecentCustomerRecord[]
  retention: RetentionMetrics
}

const API_VERSION = '2024-10-01'
const CACHE_DURATION_MS = 5 * 60 * 1000
const CUSTOMER_ANALYTICS_QUERY = `{
  "segmentTotals": {
    "activeSubscribers": {
      "count": count(*[_type == "customer" && !(_id in path("drafts.**")) && emailMarketing.subscribed == true]),
      "lifetimeValue": sum(
        *[_type == "customer" && !(_id in path("drafts.**")) && emailMarketing.subscribed == true].lifetimeValue
      )
    },
    "expiredCheckouts": {
      "count": count(
        *[_type == "customer" && !(_id in path("drafts.**")) && count(*[_type == "order" && !(_id in path("drafts.**")) && customerRef._ref == ^._id && status == "expired"]) > 0]
      ),
      "lifetimeValue": sum(
        *[_type == "customer" && !(_id in path("drafts.**")) && count(*[_type == "order" && !(_id in path("drafts.**")) && customerRef._ref == ^._id && status == "expired"]) > 0]
          .lifetimeValue
      )
    },
    "hasOrders": {
      "count": count(
        *[_type == "customer" && !(_id in path("drafts.**")) && count(*[_type == "order" && !(_id in path("drafts.**")) && customerRef._ref == ^._id]) > 0]
      ),
      "lifetimeValue": sum(
        *[_type == "customer" && !(_id in path("drafts.**")) && count(*[_type == "order" && !(_id in path("drafts.**")) && customerRef._ref == ^._id]) > 0]
          .lifetimeValue
      )
    }
  },
  "segmentCustomers": {
    "activeSubscribers": *[_type == "customer" && !(_id in path("drafts.**")) && emailMarketing.subscribed == true]
      | order(coalesce(lastOrderDate, _createdAt) desc)[0...50]{
        _id,
        firstName,
        lastName,
        email,
        lifetimeValue,
        lastOrderDate
      },
    "expiredCheckouts": *[_type == "customer" && !(_id in path("drafts.**")) && count(*[_type == "order" && !(_id in path("drafts.**")) && customerRef._ref == ^._id && status == "expired"]) > 0]
      | order(coalesce(lastOrderDate, _createdAt) desc)[0...50]{
        _id,
        firstName,
        lastName,
        email,
        lifetimeValue,
        lastOrderDate
      },
    "hasOrders": *[_type == "customer" && !(_id in path("drafts.**")) && count(*[_type == "order" && !(_id in path("drafts.**")) && customerRef._ref == ^._id]) > 0]
      | order(coalesce(lastOrderDate, _createdAt) desc)[0...50]{
        _id,
        firstName,
        lastName,
        email,
        lifetimeValue,
        lastOrderDate
      }
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
    "avgDaysBetweenOrders": select(
      count(*[_type == "customer" && !(_id in path("drafts.**")) && totalOrders > 1]) > 0 =>
        sum(
          *[_type == "customer" && !(_id in path("drafts.**")) && totalOrders > 1]
            .((lastOrderDate - firstOrderDate) / (totalOrders - 1))
        ) / count(*[_type == "customer" && !(_id in path("drafts.**")) && totalOrders > 1])
    ),
    "inactiveCustomers": count(*[_type == "customer" && !(_id in path("drafts.**")) && segment == "inactive"])
  }
}`

const SEGMENT_META: Record<SegmentKey, {label: string; icon: string}> = {
  activeSubscribers: {label: 'Active Subscribers', icon: '✅'},
  expiredCheckouts: {label: 'Customers with Expired Checkouts', icon: '🛒'},
  hasOrders: {label: 'Customers with Orders', icon: '📦'},
}

const SEGMENT_KEYS: SegmentKey[] = ['activeSubscribers', 'expiredCheckouts', 'hasOrders']

const formatCurrency = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : '$0.00'

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'MMM d, yyyy')
}

const CustomerAnalyticsDashboard = () => {
  const client = useClient({apiVersion: API_VERSION})
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSegment, setSelectedSegment] = useState<SegmentKey>('activeSubscribers')
  const cacheRef = useRef<{fetchedAt: number; data: AnalyticsResponse} | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const cached = cacheRef.current
    const now = Date.now()
    if (cached && now - cached.fetchedAt < CACHE_DURATION_MS) {
      setData(cached.data)
      setLoading(false)
      return
    }

    setLoading(true)

    client
      .fetch<AnalyticsResponse>(CUSTOMER_ANALYTICS_QUERY, {
        oneYearAgo: oneYearAgo.toISOString(),
      })
      .then((result) => {
        if (!cancelled) {
          setData(result)
          cacheRef.current = {fetchedAt: Date.now(), data: result}
        }
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

  const segmentTotals = useMemo(() => {
    const totals: Record<SegmentKey, SegmentMetrics> = {
      activeSubscribers: {count: 0, lifetimeValue: 0},
      expiredCheckouts: {count: 0, lifetimeValue: 0},
      hasOrders: {count: 0, lifetimeValue: 0},
    }
    SEGMENT_KEYS.forEach((key) => {
      const metrics = data?.segmentTotals?.[key]
      totals[key] = {count: metrics?.count ?? 0, lifetimeValue: metrics?.lifetimeValue ?? 0}
    })
    return totals
  }, [data?.segmentTotals])

  const selectedCustomers = useMemo(
    () => data?.segmentCustomers?.[selectedSegment] ?? [],
    [data?.segmentCustomers, selectedSegment]
  )

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
    <Box padding={[4, 5, 6]} style={{maxWidth: 1400, margin: '0 auto'}}>
      <Stack space={6}>
        <Stack space={3}>
          <Heading size={3}>Customer Analytics</Heading>
          <Text muted size={1}>
            Segment performance, top customers, and retention signals.
          </Text>
        </Stack>

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

        <Card padding={5} radius={3} shadow={1}>
          <Stack space={5}>
            <Text size={2} weight="semibold">
              Customer Segments
            </Text>
            <Grid columns={[1, 2, 3]} gap={[4, 5, 6]}>
              {SEGMENT_KEYS.map((key) => {
                const meta = SEGMENT_META[key]
                const metrics = segmentTotals[key]
                const isSelected = selectedSegment === key

                return (
                  <Card
                    key={key}
                    as="button"
                    type="button"
                    onClick={() => setSelectedSegment(key)}
                    padding={4}
                    radius={3}
                    border
                    tone={isSelected ? 'primary' : 'transparent'}
                    shadow={isSelected ? 1 : 0}
                    style={{textAlign: 'left', cursor: 'pointer'}}
                  >
                    <Stack space={3}>
                      <Flex gap={2} align="center">
                        <Text size={3}>{meta.icon}</Text>
                        <Text weight="semibold">{meta.label}</Text>
                      </Flex>
                      <Flex justify="space-between" align="flex-end" wrap="wrap" gap={3}>
                        <Stack space={1}>
                          <Text size={1} muted>
                            Customers
                          </Text>
                          <Text size={3} weight="semibold">
                            {metrics.count}
                          </Text>
                        </Stack>
                        <Stack space={1} style={{textAlign: 'right', justifyItems: 'end'}}>
                          <Text size={1} muted>
                            Lifetime value
                          </Text>
                          <Text weight="semibold">{formatCurrency(metrics.lifetimeValue ?? 0)}</Text>
                        </Stack>
                      </Flex>
                    </Stack>
                  </Card>
                )
              })}
            </Grid>
            <Card padding={4} radius={3} border tone="transparent">
              <Stack space={3}>
                <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
                  <Stack space={1}>
                    <Text size={1} muted>
                      Selected segment
                    </Text>
                    <Text size={2} weight="semibold">
                      {SEGMENT_META[selectedSegment].icon} {SEGMENT_META[selectedSegment].label}
                    </Text>
                    <Text size={1} muted>
                      Showing up to 50 customers, sorted by most recent activity.
                    </Text>
                  </Stack>
                  <Stack space={1} style={{textAlign: 'right', justifyItems: 'end'}}>
                    <Text size={1} muted>
                      Customers
                    </Text>
                    <Text weight="semibold">{segmentTotals[selectedSegment].count}</Text>
                    <Text size={1} muted>
                      Lifetime value: {formatCurrency(segmentTotals[selectedSegment].lifetimeValue ?? 0)}
                    </Text>
                  </Stack>
                </Flex>
                {selectedCustomers.length ? (
                  <Stack space={2}>
                    {selectedCustomers.map((customer) => (
                      <Card key={customer._id} padding={3} radius={2} border tone="transparent">
                        <Flex
                          justify="space-between"
                          align={['flex-start', 'center']}
                          wrap="wrap"
                          gap={3}
                        >
                          <Stack space={1}>
                            <Text weight="semibold">
                              {[customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
                                customer.email ||
                                'Customer'}
                            </Text>
                            <Text size={1} muted>
                              {customer.email || 'No email on file'}
                            </Text>
                          </Stack>
                          <Stack space={1} style={{textAlign: 'right', justifyItems: 'end'}}>
                            <Text weight="semibold">
                              {formatCurrency(customer.lifetimeValue ?? 0)}
                            </Text>
                            <Text size={1} muted>
                              Last order: {formatDate(customer.lastOrderDate)}
                            </Text>
                          </Stack>
                        </Flex>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Text size={1} muted>
                    No customers in this segment yet.
                  </Text>
                )}
              </Stack>
            </Card>
          </Stack>
        </Card>

        <Grid columns={[1, 2]} gap={[5, 6]}>
          <Card padding={5} radius={3} shadow={1}>
            <Stack space={4}>
              <Text size={2} weight="semibold">
                Top Customers
              </Text>
              {data?.topCustomers?.length ? (
                <Stack space={4}>
                  {data.topCustomers.slice(0, 8).map((customer) => (
                    <Card key={customer._id} padding={3} radius={2} border tone="transparent">
                      <Flex
                        justify="space-between"
                        align={['flex-start', 'center']}
                        wrap="wrap"
                        gap={3}
                      >
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
                        <Stack space={1} style={{textAlign: 'right', justifyItems: 'end'}}>
                          <Text weight="semibold">{formatCurrency(customer.lifetimeValue)}</Text>
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

          <Card padding={5} radius={3} shadow={1}>
            <Stack space={4}>
              <Text size={2} weight="semibold">
                Customer Acquisition
              </Text>
              <Stack space={3}>
                <Text size={1} muted>
                  New customers by month
                </Text>
                {monthlyNewCustomers.length ? (
                  <Stack space={2}>
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
              <Stack space={3}>
                <Text size={1} muted>
                  Acquisition sources
                </Text>
                {acquisitionSources.length ? (
                  <Stack space={2}>
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

        <Card padding={5} radius={3} shadow={1}>
          <Stack space={5}>
            <Text size={2} weight="semibold">
              Retention Metrics
            </Text>
            <Grid columns={[1, 2, 2, 4]} gap={[4, 5]}>
              <Card padding={3} border radius={3} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Total customers
                  </Text>
                  <Text size={3} weight="semibold">
                    {retention?.totalCustomers ?? 0}
                  </Text>
                </Stack>
              </Card>
              <Card padding={3} border radius={3} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Repeat rate
                  </Text>
                  <Text size={3} weight="semibold">
                    {repeatRate}%
                  </Text>
                  <Text size={1} muted>
                    ({retention?.repeatCustomers ?? 0})
                  </Text>
                </Stack>
              </Card>
              <Card padding={3} border radius={3} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Churn rate
                  </Text>
                  <Text size={3} weight="semibold">
                    {churnRate}%
                  </Text>
                  <Text size={1} muted>
                    ({retention?.inactiveCustomers ?? 0})
                  </Text>
                </Stack>
              </Card>
              <Card padding={3} border radius={3} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Avg. days between orders
                  </Text>
                  <Text size={3} weight="semibold">
                    {retention?.avgDaysBetweenOrders
                      ? Math.round(retention.avgDaysBetweenOrders / (1000 * 60 * 60 * 24))
                      : '—'}
                  </Text>
                </Stack>
              </Card>
            </Grid>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}

export default CustomerAnalyticsDashboard
