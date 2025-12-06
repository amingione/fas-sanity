import React, {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useRouter} from 'sanity/router'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@sanity/ui'
import {DownloadIcon, ResetIcon} from '@sanity/icons'
import {useWorkspaceClient} from '../../utils/useWorkspaceClient'
import {
  aggregateByPeriod,
  buildDateFilter,
  calculateTrend,
  DateRangeValue,
  formatChange,
  formatCurrency,
  formatNumber,
} from '../../utils/dashboardUtils'
import {ChartCard, DataTable, MetricCard} from './dashboard'

type RangeValue = '7' | '30' | '90' | '365'

const RANGE_OPTIONS: Array<{value: RangeValue; label: string}> = [
  {value: '7', label: 'Last 7 days'},
  {value: '30', label: 'Last 30 days'},
  {value: '90', label: 'Last 90 days'},
  {value: '365', label: 'Last 12 months'},
]

const API_VERSION = '2024-10-01'

const SALES_ANALYTICS_QUERY = `
{
  "orders": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    status == "paid" &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($rangeStart)
  ]{
    _id,
    orderNumber,
    orderType,
    totalAmount,
    createdAt,
    _createdAt,
    cart[]{
      _key,
      name,
      quantity,
      price,
      lineTotal,
      product->{_id, title}
    },
    customerRef->{_id, name, firstName, lastName, companyName},
    customerName,
    customerEmail
  },
  "previousOrders": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    status == "paid" &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($previousRangeStart) &&
    dateTime(coalesce(createdAt, _createdAt)) < dateTime($previousRangeEnd)
  ]{
    totalAmount,
    orderType,
    createdAt,
    _createdAt
  }
}
`

type RawOrder = {
  _id: string
  orderNumber?: string | null
  orderType?: string | null
  totalAmount?: number | null
  createdAt?: string | null
  _createdAt?: string | null
  customerRef?:
    | {
        _id?: string
        name?: string | null
        firstName?: string | null
        lastName?: string | null
        companyName?: string | null
        email?: string | null
      }
    | null
  customerEmail?: string | null
  customerName?: string | null
  cart?: Array<{
    _key: string
    name?: string | null
    quantity?: number | null
    price?: number | null
    lineTotal?: number | null
    product?: {_id?: string; title?: string}
  } | null> | null
}

type SalesAnalyticsResponse = {
  orders: RawOrder[]
  previousOrders: RawOrder[]
}

type ProductSummary = {
  id: string
  documentId?: string
  title: string
  revenue: number
  units: number
  averagePrice: number
}

type TopCustomerRow = {
  _id: string
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  email?: string | null
  totalSpent: number
  orderCount: number
  lastOrderDate?: string | null
}

const CHANNEL_LABELS: Record<string, string> = {
  online: 'Online',
  'in-store': 'In-Store',
  wholesale: 'Wholesale',
}

export const SalesAnalyticsDashboard = forwardRef<HTMLDivElement>(function SalesAnalyticsDashboard(
  _props,
  ref,
) {
  const client = useWorkspaceClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [range, setRange] = useState<RangeValue>('30')
  const [comparisonMode, setComparisonMode] = useState(true)
  const [data, setData] = useState<SalesAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const now = new Date()
    const rangeFilter = buildDateFilter(range as DateRangeValue, now)
    const rangeStartDate = new Date(rangeFilter.start)
    const rangeEndDate = new Date(rangeFilter.end)
    const duration = Math.max(rangeEndDate.getTime() - rangeStartDate.getTime(), 60 * 60 * 1000)
    const previousRangeEndDate = rangeStartDate
    const previousRangeStartDate = new Date(previousRangeEndDate.getTime() - duration)

    try {
      const result = await client.fetch<SalesAnalyticsResponse>(SALES_ANALYTICS_QUERY, {
        rangeStart: rangeStartDate.toISOString(),
        previousRangeStart: previousRangeStartDate.toISOString(),
        previousRangeEnd: previousRangeEndDate.toISOString(),
      })
      setData(result)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load sales analytics')
    } finally {
      setLoading(false)
    }
  }, [client, range])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshIndex])

  const totalRevenue = useMemo(
    () => (data?.orders ?? []).reduce((sum, order) => sum + (order.totalAmount ?? 0), 0),
    [data],
  )

  const previousRevenue = useMemo(
    () => (data?.previousOrders ?? []).reduce((sum, order) => sum + (order.totalAmount ?? 0), 0),
    [data],
  )

  const topCustomers = useMemo<TopCustomerRow[]>(() => {
    if (!data?.orders?.length) return []
    const groups = new Map<string, TopCustomerRow>()
    for (const order of data.orders) {
      const customerId =
        order.customerRef?._id || order.customerEmail || order.customerName || order._id
      if (!customerId) continue
      const existing =
        groups.get(customerId) ||
        {
          _id: customerId,
          name: order.customerRef?.name || order.customerName || null,
          firstName: order.customerRef?.firstName || null,
          lastName: order.customerRef?.lastName || null,
          companyName: order.customerRef?.companyName || null,
          email: order.customerRef?.email || order.customerEmail || null,
          totalSpent: 0,
          orderCount: 0,
          lastOrderDate: null,
        }
      existing.totalSpent += Number(order.totalAmount ?? 0)
      existing.orderCount += 1
      const orderDate = order.createdAt || order._createdAt
      if (orderDate && (!existing.lastOrderDate || orderDate > existing.lastOrderDate)) {
        existing.lastOrderDate = orderDate
      }
      groups.set(customerId, existing)
    }
    return Array.from(groups.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
  }, [data?.orders])

  const orderCount = data?.orders.length ?? 0
  const previousOrderCount = data?.previousOrders.length ?? 0
  const averageOrderValue = orderCount ? totalRevenue / orderCount : 0
  const previousAverage = previousOrderCount ? previousRevenue / previousOrderCount : 0

  const channelTotals = useMemo(() => {
    const totals: Record<string, number> = {online: 0, 'in-store': 0, wholesale: 0}
    for (const order of data?.orders ?? []) {
      const channel = order.orderType || 'online'
      if (!(channel in totals)) totals[channel] = 0
      totals[channel] += order.totalAmount ?? 0
    }
    return totals
  }, [data])

  const revenueByChannelChart = useMemo(() => {
    const entries = Object.entries(channelTotals)
    const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1
    return entries.map(([key, value]) => ({
      label: CHANNEL_LABELS[key] || key,
      value,
      percent: value / total,
    }))
  }, [channelTotals])

  const topProducts = useMemo(() => {
    const map = new Map<string, ProductSummary>()
    for (const order of data?.orders ?? []) {
      const cart = order.cart ?? []
      cart.forEach((item) => {
        if (!item) return
        const productDocId = item.product?._id
        const mapKey = productDocId || item._key
        const title = item.product?.title || item.name || 'Unknown product'
        const quantity = item.quantity ?? 1
        const revenue = item.lineTotal ?? (item.price ?? 0) * quantity
        const current = map.get(mapKey) || {
          id: mapKey,
          documentId: productDocId || undefined,
          title,
          revenue: 0,
          units: 0,
          averagePrice: 0,
        }
        current.revenue += revenue
        current.units += quantity
        current.averagePrice = current.units ? current.revenue / current.units : 0
        if (!current.documentId && productDocId) current.documentId = productDocId
        map.set(mapKey, current)
      })
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [data])

  const salesTrendPeriod = useMemo(() => {
    if (range === '365') return 'month'
    if (range === '90') return 'week'
    return 'day'
  }, [range])

  const salesTrendData = useMemo(() => {
    const toSeries = (orders: RawOrder[]) =>
      aggregateByPeriod(
        orders.map((order) => ({
          date: order.createdAt || order._createdAt || new Date().toISOString(),
          value: order.totalAmount ?? 0,
        })),
        salesTrendPeriod as 'day' | 'week' | 'month',
      )
    const currentSeries = toSeries(data?.orders ?? [])
    const previousSeries = toSeries(data?.previousOrders ?? [])
    const maxLength = Math.max(currentSeries.length, previousSeries.length)
    return Array.from({length: maxLength || currentSeries.length || 1}, (_, index) => ({
      label:
        currentSeries[index]?.label ||
        previousSeries[index]?.label ||
        `Period ${index + 1}`,
      current: currentSeries[index]?.value ?? 0,
      previous: previousSeries[index]?.value ?? 0,
    }))
  }, [data, salesTrendPeriod])

  const revenueChange = calculateTrend(totalRevenue, previousRevenue)
  const orderChangeMetric = calculateTrend(orderCount, previousOrderCount)
  const averageChange = calculateTrend(averageOrderValue, previousAverage)

  const handleExport = useCallback(() => {
    if (!data?.orders?.length || typeof window === 'undefined') return
    const rows = [
      ['Order Number', 'Order Type', 'Total Amount', 'Created At'],
      ...data.orders.map((order) => [
        order.orderNumber || order._id,
        order.orderType || 'online',
        (order.totalAmount ?? 0).toFixed(2),
        order.createdAt || order._createdAt || '',
      ]),
    ]
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = cell ?? ''
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value.replace(/"/g, '""')}"`
            }
            return value
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sales-analytics-${range}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [data, range])

  const goToDocument = useCallback(
    (id: string, type: string) => {
      if (router.navigateIntent) {
        router.navigateIntent('edit', {id, type})
      } else if (typeof window !== 'undefined') {
        window.location.hash = `#/intent/edit/mode=edit&type=${type}&id=${id}`
      }
    },
    [router],
  )

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Stack space={2}>
            <Heading size={3}>Sales Analytics</Heading>
            <Text muted size={1}>
              Channel performance, product momentum, and customer lifetime value.
            </Text>
          </Stack>
          <Flex gap={3} align="center">
            <Select
              value={range}
              onChange={(event) => setRange(event.currentTarget.value as RangeValue)}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              icon={DownloadIcon}
              text="Export CSV"
              mode="ghost"
              tone="primary"
              onClick={handleExport}
              disabled={!data?.orders?.length}
            />
            <Button
              icon={ResetIcon}
              text="Refresh"
              tone="primary"
              mode="ghost"
              onClick={() => setRefreshIndex((prev) => prev + 1)}
              disabled={loading}
            />
          </Flex>
        </Flex>

        <Card padding={4} radius={3}>
          <Flex align="center" gap={3}>
            <Switch
              checked={comparisonMode}
              onChange={(event) => setComparisonMode(event.currentTarget.checked)}
            />
            <Text size={1} muted>
              Comparison mode
            </Text>
          </Flex>
        </Card>

        {error ? (
          <Card padding={4} tone="critical" radius={3}>
            <Stack space={3}>
              <Text weight="bold">Unable to load analytics</Text>
              <Text size={1}>{error}</Text>
              <Button text="Try again" tone="critical" onClick={fetchData} />
            </Stack>
          </Card>
        ) : null}

        {loading && !data ? (
          <Card padding={6} radius={3}>
            <Flex align="center" justify="center" style={{minHeight: 240}}>
              <Spinner muted />
            </Flex>
          </Card>
        ) : (
          <>
            <Grid columns={[1, 1, 3]} gap={3}>
              <MetricCard
                title="Revenue"
                value={formatCurrency(totalRevenue)}
                change={revenueChange ?? undefined}
                description={`vs previous: ${formatChange(totalRevenue, previousRevenue)}`}
                color="primary"
                isLoading={loading}
              />
              <MetricCard
                title="Orders"
                value={formatNumber(orderCount)}
                change={orderChangeMetric ?? undefined}
                description={`vs previous: ${formatChange(orderCount, previousOrderCount)}`}
                isLoading={loading}
              />
              <MetricCard
                title="Average Order Value"
                value={formatCurrency(averageOrderValue)}
                change={averageChange ?? undefined}
                description={`vs previous: ${formatChange(averageOrderValue, previousAverage)}`}
                isLoading={loading}
              />
            </Grid>

            {comparisonMode && (
              <Card padding={4} radius={3} shadow={1}>
                <Stack space={3}>
                  <Heading size={1}>Period Comparison</Heading>
                  <Grid columns={[1, 3]} gap={3}>
                    <Stack space={1}>
                      <Text size={1} muted>
                        Current Period
                      </Text>
                      <Text weight="bold">{formatCurrency(totalRevenue)}</Text>
                    </Stack>
                    <Stack space={1}>
                      <Text size={1} muted>
                        Previous Period
                      </Text>
                      <Text weight="bold">{formatCurrency(previousRevenue)}</Text>
                    </Stack>
                    <Stack space={1}>
                      <Text size={1} muted>
                        Change
                      </Text>
                      <Badge tone={revenueChange && revenueChange >= 0 ? 'positive' : 'critical'}>
                        {formatChange(totalRevenue, previousRevenue)}
                      </Badge>
                    </Stack>
                  </Grid>
                </Stack>
              </Card>
            )}

            <Card padding={4} radius={3} shadow={1}>
              <Stack space={4}>
                <Flex align="center" justify="space-between">
                  <Heading size={2}>Revenue by Channel</Heading>
                  <Text muted size={1}>
                    {RANGE_OPTIONS.find((opt) => opt.value === range)?.label}
                  </Text>
                </Flex>
                <ChartCard
                  type="bar"
                  title=""
                  data={revenueByChannelChart}
                  categoryKey="label"
                  valueKey="value"
                  formatValue={(value) => formatCurrency(value)}
                  isLoading={loading}
                />
                <Flex wrap="wrap" gap={4}>
                  {revenueByChannelChart.map((entry) => (
                    <Stack key={entry.label} space={1}>
                      <Text size={1} muted>
                        {entry.label}
                      </Text>
                      <Text weight="bold">{formatCurrency(entry.value)}</Text>
                      <Text size={1} muted>
                        {(entry.percent * 100).toFixed(1)}%
                      </Text>
                    </Stack>
                  ))}
                </Flex>
              </Stack>
            </Card>

            <Grid columns={[1, 1, 2]} gap={4}>
              <Card padding={4} radius={3} shadow={1}>
                <Stack space={3}>
                  <Heading size={1}>Top Products</Heading>
                  <DataTable
                    columns={[
                      {key: 'title', title: 'Product', sortable: true},
                      {
                        key: 'revenue',
                        title: 'Revenue',
                        sortable: true,
                        render: (row: ProductSummary) => formatCurrency(row.revenue),
                        align: 'right',
                      },
                      {
                        key: 'units',
                        title: 'Units',
                        sortable: true,
                        align: 'right',
                      },
                      {
                        key: 'averagePrice',
                        title: 'Avg. Price',
                        sortable: true,
                        render: (row: ProductSummary) => formatCurrency(row.averagePrice),
                        align: 'right',
                      },
                    ]}
                    data={topProducts}
                    pageSize={10}
                    isLoading={loading}
                    searchableKeys={['title']}
                    onRowClick={(row) => row.documentId && goToDocument(row.documentId, 'product')}
                    rowKey={(row) => row.id}
                    emptyState="No product sales recorded for this period."
                  />
                </Stack>
              </Card>

              <Card padding={4} radius={3} shadow={1}>
                <Stack space={3}>
                  <Heading size={1}>Top Customers</Heading>
                  <DataTable
                    columns={[
                      {
                        key: 'name',
                        title: 'Customer',
                        render: (row: TopCustomerRow) =>
                          row.name ||
                          [row.firstName, row.lastName].filter(Boolean).join(' ') ||
                          row.companyName ||
                          'Customer',
                      },
                      {
                        key: 'totalSpent',
                        title: 'Total Spent',
                        render: (row: TopCustomerRow) => formatCurrency(row.totalSpent ?? 0),
                        align: 'right',
                        sortable: true,
                      },
                      {
                        key: 'orderCount',
                        title: 'Orders',
                        align: 'right',
                      },
                      {
                        key: 'lastOrderDate',
                        title: 'Last Order',
                        render: (row: TopCustomerRow) =>
                          row.lastOrderDate
                            ? new Date(row.lastOrderDate).toLocaleDateString()
                            : '—',
                      },
                    ]}
                    data={topCustomers}
                    pageSize={10}
                    isLoading={loading}
                    searchableKeys={['name', 'email', 'companyName']}
                    onRowClick={(row) => goToDocument(row._id, 'customer')}
                    rowKey={(row) => row._id}
                    emptyState="No customers available."
                  />
                </Stack>
              </Card>
            </Grid>

            <Card padding={4} radius={3} shadow={1}>
              <Stack space={3}>
                <Flex align="center" justify="space-between">
                  <Heading size={2}>Sales Trends</Heading>
                  <Text muted size={1}>
                    {salesTrendPeriod === 'month'
                      ? 'Monthly view'
                      : salesTrendPeriod === 'week'
                        ? 'Weekly view'
                        : 'Daily view'}
                  </Text>
                </Flex>
                <ChartCard
                  type="line"
                  title=""
                  data={salesTrendData}
                  categoryKey="label"
                  dataKeys={comparisonMode ? ['current', 'previous'] : ['current']}
                  formatValue={(value) => formatCurrency(value)}
                  isLoading={loading}
                  emptyState="No revenue data in this window."
                />
                {comparisonMode && (
                  <Text size={1} muted>
                    Change vs previous: {formatChange(totalRevenue, previousRevenue)}
                  </Text>
                )}
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Box>
  )
})

SalesAnalyticsDashboard.displayName = 'SalesAnalyticsDashboard'

export default SalesAnalyticsDashboard
