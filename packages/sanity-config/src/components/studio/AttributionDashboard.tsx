import {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'

type AttributionDoc = {
  utmSource?: string
  utmCampaign?: string
  orderValue?: number
  touchpoints?: number
  sessionId?: string
  customer?: {_ref?: string}
}

type SpendSnapshot = {
  source?: string
  spend?: number
  newCustomers?: number
}

type LtvRow = {
  lifetimeValue?: number
  firstSource?: string
}

type DashboardQueryResult = {
  attributions: AttributionDoc[]
  expiredCarts: number
  spend: SpendSnapshot[]
  ltv: LtvRow[]
}

const DATE_PRESETS = [
  {label: '7d', days: 7},
  {label: '30d', days: 30},
  {label: '90d', days: 90},
]

const DASHBOARD_QUERY = `{
  "attributions": *[_type == "attribution" && createdAt >= $start]{
    utmSource,
    utmCampaign,
    orderValue,
    touchpoints,
    sessionId,
    customer
  },
  "expiredCarts": count(*[_type == "expiredCart" && coalesce(expiredAt, _createdAt) >= $start]),
  "spend": *[_type == "attributionSnapshot" && coalesce(syncDate, _updatedAt) >= $start]{
    source,
    "spend": metrics.spend,
    "newCustomers": metrics.newCustomers
  },
  "ltv": *[_type == "customer" && defined(lifetimeValue)]{
    lifetimeValue,
    "firstSource": *[_type == "attribution" && customer._ref == ^._id] | order(createdAt asc)[0].utmSource
  }
}`

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value)
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

const SOURCE_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  email: 'Email',
  direct: 'Direct',
  other: 'Other',
}

const normalizeSource = (value?: string) => {
  if (!value) return 'direct'
  const compare = value.toLowerCase()
  if (compare.includes('google')) return 'google'
  if (compare.includes('facebook') || compare.includes('meta')) return 'facebook'
  if (compare.includes('email') || compare.includes('klaviyo') || compare.includes('newsletter'))
    return 'email'
  if (compare === 'direct' || compare === '(direct)' || compare === 'none') return 'direct'
  return 'other'
}

const RangeButton = ({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) => (
  <Button
    mode={active ? 'default' : 'ghost'}
    tone={active ? 'primary' : 'default'}
    text={label}
    onClick={onClick}
  />
)

const FunnelStep = ({label, value, max}: {label: string; value: number; max: number}) => {
  const percent = max > 0 ? value / max : 0
  return (
    <Stack space={2}>
      <Flex justify="space-between" align="center">
        <Text size={1}>{label}</Text>
        <Badge tone="primary">{value}</Badge>
      </Flex>
      <Card
        padding={1}
        radius={3}
        style={{
          background: 'var(--card-border-color)',
          height: 12,
        }}
      >
        <Box
          style={{
            width: `${Math.max(percent * 100, 4)}%`,
            height: '100%',
            background: 'var(--card-accent-fg-color)',
            borderRadius: 4,
          }}
        />
      </Card>
    </Stack>
  )
}

export default function AttributionDashboard() {
  const client = useClient({apiVersion: '2024-10-01'})
  const [rangeDays, setRangeDays] = useState(30)
  const [data, setData] = useState<DashboardQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rangeStart = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)
    return start.toISOString()
  }, [rangeDays])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await client.fetch<DashboardQueryResult>(DASHBOARD_QUERY, {start: rangeStart})
      setData(result)
    } catch (err) {
      console.error('AttributionDashboard: failed to load data', err)
      setError(err instanceof Error ? err.message : 'Unable to load attribution data.')
    } finally {
      setLoading(false)
    }
  }, [client, rangeStart])

  useEffect(() => {
    load()
  }, [load])

  const revenueBySource = useMemo(() => {
    const totals: Record<string, number> = {google: 0, facebook: 0, email: 0, direct: 0, other: 0}
    data?.attributions?.forEach((attr) => {
      const bucket = normalizeSource(attr.utmSource)
      totals[bucket] += Number(attr.orderValue || 0)
    })
    return totals
  }, [data])

  const campaignPerformance = useMemo(() => {
    const map = new Map<
      string,
      {
        orders: number
        revenue: number
      }
    >()
    data?.attributions?.forEach((attr) => {
      const key = (attr.utmCampaign || 'Uncategorized').trim() || 'Uncategorized'
      const entry = map.get(key) || {orders: 0, revenue: 0}
      entry.orders += 1
      entry.revenue += Number(attr.orderValue || 0)
      map.set(key, entry)
    })
    return Array.from(map.entries())
      .map(([campaign, stats]) => ({
        campaign,
        orders: stats.orders,
        revenue: stats.revenue,
        avgOrderValue: stats.orders > 0 ? stats.revenue / stats.orders : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [data])

  const cacRows = useMemo(() => {
    const spendMap = new Map<
      string,
      {
        spend: number
        reportedCustomers: number
      }
    >()
    data?.spend?.forEach((row) => {
      const key = normalizeSource(row.source)
      const existing = spendMap.get(key) || {spend: 0, reportedCustomers: 0}
      existing.spend += Number(row.spend || 0)
      existing.reportedCustomers += Number(row.newCustomers || 0)
      spendMap.set(key, existing)
    })

    const customerSets = new Map<string, Set<string>>()
    data?.attributions?.forEach((attr) => {
      const key = normalizeSource(attr.utmSource)
      if (!customerSets.has(key)) customerSets.set(key, new Set())
      const ref = attr.customer?._ref
      if (ref) customerSets.get(key)!.add(ref)
    })

    const sources = Array.from(new Set([...spendMap.keys(), ...customerSets.keys()]))
    return sources
      .map((source) => {
        const spend = spendMap.get(source)?.spend || 0
        const distinctCustomers = customerSets.get(source)?.size || 0
        const reportedCustomers = spendMap.get(source)?.reportedCustomers || 0
        const customers = Math.max(distinctCustomers, reportedCustomers)
        return {
          source,
          spend,
          customers,
          cac: customers > 0 ? spend / customers : 0,
        }
      })
      .sort((a, b) => b.spend - a.spend)
  }, [data])

  const ltvBySource = useMemo(() => {
    const groups = new Map<
      string,
      {
        customers: number
        total: number
      }
    >()
    data?.ltv?.forEach((row) => {
      const source = normalizeSource(row.firstSource)
      const entry = groups.get(source) || {customers: 0, total: 0}
      entry.customers += 1
      entry.total += Number(row.lifetimeValue || 0)
      groups.set(source, entry)
    })
    return Array.from(groups.entries()).map(([source, stats]) => ({
      source,
      customers: stats.customers,
      avgLTV: stats.customers > 0 ? stats.total / stats.customers : 0,
    }))
  }, [data])

  const conversionFunnel = useMemo(() => {
    const purchases = data?.attributions?.length || 0
    const checkout = data?.attributions?.filter((attr) => Boolean(attr.sessionId)).length || 0
    const addToCart = checkout + (data?.expiredCarts || 0)
    const visits =
      (data?.attributions?.reduce((sum, attr) => sum + Number(attr.touchpoints || 1), 0) || 0) +
      purchases
    const max = Math.max(visits, addToCart, checkout, purchases)
    return {
      steps: [
        {label: 'Visits', value: Math.max(visits, max)},
        {label: 'Add to Cart', value: addToCart},
        {label: 'Checkout', value: checkout},
        {label: 'Purchase', value: purchases},
      ],
      max,
    }
  }, [data])

  const totalRevenue = useMemo(() => {
    return data?.attributions?.reduce((sum, attr) => sum + Number(attr.orderValue || 0), 0) || 0
  }, [data])

  return (
    <Stack space={4}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Stack space={2}>
          <Heading as="h2" size={3}>
            Attribution Overview
          </Heading>
          <Text size={1} muted>
            Measure the impact of marketing channels and campaigns over time.
          </Text>
        </Stack>
        <Flex gap={2} align="center">
          {DATE_PRESETS.map((preset) => (
            <RangeButton
              key={preset.label}
              label={preset.label}
              active={rangeDays === preset.days}
              onClick={() => setRangeDays(preset.days)}
            />
          ))}
          <Button text="Refresh" mode="ghost" onClick={load} disabled={loading} />
        </Flex>
      </Flex>

      {loading && (
        <Card padding={4} radius={2} border tone="primary">
          <Flex align="center" gap={3}>
            <Spinner />
            <Text>Loading attribution data…</Text>
          </Flex>
        </Card>
      )}

      {error && (
        <Card padding={4} radius={2} tone="critical" border>
          <Stack space={2}>
            <Text weight="semibold">Unable to load data</Text>
            <Text size={1}>{error}</Text>
            <Button text="Retry" onClick={load} />
          </Stack>
        </Card>
      )}

      {!error && data && (
        <>
          <Grid columns={[1, 2, 4]} gap={4}>
            <Card padding={4} radius={2} border>
              <Stack space={2}>
                <Text size={1} muted>Total Revenue</Text>
                <Text size={3} weight="semibold">
                  {formatCurrency(totalRevenue)}
                </Text>
              </Stack>
            </Card>
            <Card padding={4} radius={2} border>
              <Stack space={2}>
                <Text size={1} muted>Purchases</Text>
                <Text size={3} weight="semibold">
                  {data.attributions.length}
                </Text>
              </Stack>
            </Card>
            <Card padding={4} radius={2} border>
              <Stack space={2}>
                <Text size={1} muted>Expired Carts</Text>
                <Text size={3} weight="semibold">
                  {data.expiredCarts}
                </Text>
              </Stack>
            </Card>
            <Card padding={4} radius={2} border>
              <Stack space={2}>
                <Text size={1} muted>Sources tracked</Text>
                <Text size={3} weight="semibold">
                  {Object.entries(revenueBySource).filter(([, value]) => value > 0).length}
                </Text>
              </Stack>
            </Card>
          </Grid>

          <Card padding={4} radius={2} border>
            <Stack space={4}>
              <Text weight="semibold">Revenue by Source</Text>
              <Grid columns={[1, 2, 5]} gap={4}>
                {Object.entries(revenueBySource).map(([source, value]) => (
                  <Card key={source} padding={3} radius={2} tone="transparent" border>
                    <Stack space={2}>
                      <Text size={1} muted>
                        {SOURCE_LABELS[source] || source}
                      </Text>
                      <Text weight="semibold">{formatCurrency(value)}</Text>
                    </Stack>
                  </Card>
                ))}
              </Grid>
            </Stack>
          </Card>

          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Text weight="semibold">Campaign Performance</Text>
              <Stack as="div" space={2}>
                {campaignPerformance.length === 0 && (
                  <Text size={1} muted>
                    No campaign attribution data yet.
                  </Text>
                )}
                {campaignPerformance.slice(0, 6).map((row) => (
                  <Flex
                    key={row.campaign}
                    justify="space-between"
                    align="center"
                    style={{borderBottom: '1px solid var(--card-border-color)', paddingBottom: 6}}
                  >
                    <Stack space={1}>
                      <Text weight="medium">{row.campaign}</Text>
                      <Text size={1} muted>
                        {row.orders} orders
                      </Text>
                    </Stack>
                    <Stack style={{textAlign: 'right'}} space={1}>
                      <Text weight="semibold">{formatCurrency(row.revenue)}</Text>
                      <Text size={1} muted>
                        Avg {formatCurrency(row.avgOrderValue)}
                      </Text>
                    </Stack>
                  </Flex>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Grid columns={[1, 2]} gap={4}>
            <Card padding={4} radius={2} border>
              <Stack space={3}>
                <Text weight="semibold">Customer Acquisition Cost</Text>
                {cacRows.length === 0 && (
                  <Text size={1} muted>
                    No spend data captured yet.
                  </Text>
                )}
                <Stack space={2}>
                  {cacRows.map((row) => (
                    <Flex key={row.source} justify="space-between" align="center">
                      <Stack space={1}>
                        <Text weight="medium">{SOURCE_LABELS[row.source] || row.source}</Text>
                        <Text size={1} muted>
                          {row.customers} customers
                        </Text>
                      </Stack>
                      <Stack style={{textAlign: 'right'}} space={1}>
                        <Text>{formatCurrency(row.spend)}</Text>
                        <Text size={1} muted>CAC {formatCurrency(row.cac)}</Text>
                      </Stack>
                    </Flex>
                  ))}
                </Stack>
              </Stack>
            </Card>

            <Card padding={4} radius={2} border>
              <Stack space={3}>
                <Text weight="semibold">Lifetime Value by Source</Text>
                {ltvBySource.length === 0 && (
                  <Text size={1} muted>
                    Not enough LTV data yet.
                  </Text>
                )}
                <Stack space={2}>
                  {ltvBySource.map((row) => (
                    <Flex key={row.source} justify="space-between" align="center">
                      <Stack space={1}>
                        <Text weight="medium">{SOURCE_LABELS[row.source] || row.source}</Text>
                        <Text size={1} muted>
                          {row.customers} customers
                        </Text>
                      </Stack>
                      <Text>{formatCurrency(row.avgLTV)}</Text>
                    </Flex>
                  ))}
                </Stack>
              </Stack>
            </Card>
          </Grid>

          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Flex align="center" gap={2}>
                <Text weight="semibold">Conversion Funnel</Text>
                <Badge tone="primary">{rangeDays}-day lookback</Badge>
              </Flex>
              <Grid columns={[1, 2, 4]} gap={3}>
                {conversionFunnel.steps.map((step) => (
                  <FunnelStep key={step.label} label={step.label} value={step.value} max={conversionFunnel.max || 1} />
                ))}
              </Grid>
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}
