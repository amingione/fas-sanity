import React, {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useRouter} from 'sanity/router'
import {Box, Button, Card, Flex, Grid, Heading, Select, Spinner, Stack, Text} from '@sanity/ui'
import {
  BillIcon,
  ClipboardIcon,
  ResetIcon,
  WrenchIcon,
  CalendarIcon,
  UsersIcon,
  PackageIcon,
} from '@sanity/icons'
import {useWorkspaceClient} from '../../utils/useWorkspaceClient'
import {
  DateRangeValue,
  buildDateFilter,
  calculateTrend,
  formatChange,
  formatCurrency,
  formatNumber,
  getToday,
} from '../../utils/dashboardUtils'
import {AlertCard, ChartCard, MetricCard, StatsList} from './dashboard'

const API_VERSION = '2024-10-01'

const DATE_RANGE_OPTIONS: Array<{value: DateRangeValue; label: string}> = [
  {value: 'today', label: 'Today'},
  {value: 'week', label: 'This Week'},
  {value: 'month', label: 'This Month'},
  {value: 'year', label: 'This Year'},
]

const HOME_DASHBOARD_QUERY = `
{
  "ordersToday": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($todayStart)
  ]{
    _id,
    orderType,
    totalAmount,
    status,
    fulfilledAt,
    createdAt,
    _createdAt
  },
  "appointmentsToday": count(*[
    _type == "appointment" &&
    !(_id in path("drafts.**")) &&
    dateTime(scheduledDate) >= dateTime($todayStart) &&
    dateTime(scheduledDate) < dateTime($tomorrowStart)
  ]),
  "activeWorkOrders": count(*[
    _type == "workOrder" &&
    !(_id in path("drafts.**")) &&
    status == "in_progress"
  ]),
  "periodOrders": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($rangeStart) &&
    dateTime(coalesce(createdAt, _createdAt)) <= dateTime($rangeEnd)
  ]{
    _id,
    orderType,
    totalAmount,
    status,
    createdAt,
    _createdAt
  },
  "previousOrders": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($previousRangeStart) &&
    dateTime(coalesce(createdAt, _createdAt)) < dateTime($previousRangeEnd)
  ]{
    _id,
    orderType,
    totalAmount,
    status,
    createdAt,
    _createdAt
  },
  "newCustomers": count(*[
    _type == "customer" &&
    !(_id in path("drafts.**")) &&
    dateTime(_createdAt) >= dateTime($rangeStart)
  ]),
  "alerts": {
    "vendorApplications": count(*[_type == "vendorApplication" && status == "pending"]),
    "vendorQuotes": count(*[_type == "vendorQuote" && status == "sent"]),
    "ordersNeedFulfillment": count(*[
      _type == "order" &&
      !(_id in path("drafts.**")) &&
      status == "paid" &&
      (!defined(fulfilledAt) || fulfilledAt == null)
    ]),
    "vendorsOverCredit": count(*[
      _type == "vendor" &&
      defined(currentBalance) &&
      defined(creditLimit) &&
      currentBalance > creditLimit
    ]),
    "productsLowStock": count(*[
      _type == "product" &&
      defined(inventory.quantity) &&
      defined(inventory.reorderPoint) &&
      inventory.quantity <= inventory.reorderPoint
    ]),
    "workOrdersWaitingParts": count(*[
      _type == "workOrder" &&
      status == "waiting_parts"
    ]),
    "appointmentsNeedConfirmation": count(*[
      _type == "appointment" &&
      status == "scheduled" &&
      dateTime(scheduledDate) <= dateTime($upcomingThreshold)
    ])
  },
  "quickStats": {
    "customers": count(*[_type == "customer" && !(_id in path("drafts.**"))]),
    "vendors": count(*[_type == "vendor" && accountStatus == "active"]),
    "products": count(*[_type == "product" && !(_id in path("drafts.**"))]),
    "services": count(*[_type == "service" && !(_id in path("drafts.**"))])
  }
}
`

type OrderSummary = {
  _id: string
  orderType?: string | null
  totalAmount?: number | null
  status?: string | null
  createdAt?: string | null
  _createdAt?: string | null
  fulfilledAt?: string | null
}

type HomeDashboardResponse = {
  ordersToday: OrderSummary[]
  periodOrders: OrderSummary[]
  previousOrders: OrderSummary[]
  appointmentsToday: number
  activeWorkOrders: number
  newCustomers: number
  alerts: Record<string, number>
  quickStats: Record<string, number>
}

type DrilldownTarget =
  | 'orders'
  | 'appointments'
  | 'workOrders'
  | 'customers'
  | 'vendors'
  | 'products'
  | 'services'
  | 'vendorApplications'
  | 'vendorQuotes'

const DRILLDOWN_PATHS: Record<DrilldownTarget, string> = {
  orders: '/desk/orders;orders-all',
  appointments: '/desk/in-store-operations;in-store-appointments;appointments-all',
  workOrders: '/desk/in-store-operations;in-store-work-orders;work-orders-in-progress',
  customers: '/desk/customers;customers-all',
  vendors: '/desk/wholesale-manufacturing;wholesale-vendors',
  products: '/desk/products;products-all',
  services: '/desk/in-store-operations;in-store-services;services-all',
  vendorApplications: '/desk/wholesale-manufacturing;vendor-applications',
  vendorQuotes: '/desk/wholesale-manufacturing;vendor-quotes',
}

export const HomeDashboard = forwardRef<HTMLDivElement>(function HomeDashboard(_props, ref) {
  const client = useWorkspaceClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [range, setRange] = useState<DateRangeValue>('month')
  const [data, setData] = useState<HomeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const ordersToday = data?.ordersToday ?? []
  const periodOrders = data?.periodOrders ?? []
  const previousOrders = data?.previousOrders ?? []

  const metrics = useMemo(() => {
    const ordersByTypeToday = {online: 0, inStore: 0, wholesale: 0}
    let revenueToday = 0
    ordersToday.forEach((order) => {
      if (order.orderType === 'online') ordersByTypeToday.online += 1
      else if (order.orderType === 'in-store') ordersByTypeToday.inStore += 1
      else if (order.orderType === 'wholesale') ordersByTypeToday.wholesale += 1
      if (order.status === 'paid') {
        revenueToday += Number(order.totalAmount ?? 0)
      }
    })

    const revenueByChannel = {online: 0, inStore: 0, wholesale: 0}
    let periodRevenue = 0
    periodOrders.forEach((order) => {
      if (order.status !== 'paid') return
      const amount = Number(order.totalAmount ?? 0)
      periodRevenue += amount
      if (order.orderType === 'online') revenueByChannel.online += amount
      else if (order.orderType === 'in-store') revenueByChannel.inStore += amount
      else if (order.orderType === 'wholesale') revenueByChannel.wholesale += amount
    })

    let previousRevenue = 0
    previousOrders.forEach((order) => {
      if (order.status === 'paid') {
        previousRevenue += Number(order.totalAmount ?? 0)
      }
    })

    return {
      revenueToday,
      ordersTodayCount: ordersToday.length,
      ordersByTypeToday,
      periodRevenue,
      previousRevenue,
      periodOrdersCount: periodOrders.length,
      previousOrdersCount: previousOrders.length,
      revenueByChannel,
    }
  }, [ordersToday, periodOrders, previousOrders])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const now = new Date()
    const todayStart = getToday(now)
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    const rangeFilter = buildDateFilter(range, now)
    const rangeStartDate = new Date(rangeFilter.start)
    const rangeEndDate = new Date(rangeFilter.end)
    const rangeDuration = Math.max(rangeEndDate.getTime() - rangeStartDate.getTime(), 60 * 60 * 1000)
    const previousRangeEndDate = rangeStartDate
    const previousRangeStartDate = new Date(previousRangeEndDate.getTime() - rangeDuration)
    const upcomingThreshold = new Date(todayStart)
    upcomingThreshold.setDate(upcomingThreshold.getDate() + 7)

    try {
      const result = await client.fetch<HomeDashboardResponse>(HOME_DASHBOARD_QUERY, {
        todayStart: todayStart.toISOString(),
        tomorrowStart: tomorrowStart.toISOString(),
        rangeStart: rangeStartDate.toISOString(),
        rangeEnd: rangeEndDate.toISOString(),
        previousRangeStart: previousRangeStartDate.toISOString(),
        previousRangeEnd: previousRangeEndDate.toISOString(),
        upcomingThreshold: upcomingThreshold.toISOString(),
      })

      setData(result)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [client, range])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshIndex])

  const handleRefresh = useCallback(() => {
    setRefreshIndex((prev) => prev + 1)
  }, [])

  const handleDrilldown = useCallback(
    (target: DrilldownTarget) => {
      const path = DRILLDOWN_PATHS[target]
      if (!path) return
      if (router.navigateUrl) {
        router.navigateUrl({path})
      } else if (typeof window !== 'undefined') {
        window.location.hash = `#${path}`
      }
    },
    [router],
  )

  const revenueChange = useMemo(() => {
    if (!data) return null
    return calculateTrend(metrics.periodRevenue, metrics.previousRevenue)
  }, [data, metrics.periodRevenue, metrics.previousRevenue])

  const orderChange = useMemo(() => {
    if (!data) return null
    return calculateTrend(metrics.periodOrdersCount, metrics.previousOrdersCount)
  }, [data, metrics.periodOrdersCount, metrics.previousOrdersCount])

  const revenueByChannelChart = useMemo(() => {
    return [
      {label: 'Online', value: metrics.revenueByChannel.online},
      {label: 'In-Store', value: metrics.revenueByChannel.inStore},
      {label: 'Wholesale', value: metrics.revenueByChannel.wholesale},
    ]
  }, [metrics.revenueByChannel])

  const ordersByTypeList = useMemo(() => {
    return [
      {
        label: 'Online',
        value: formatNumber(metrics.ordersByTypeToday.online),
        onClick: () => handleDrilldown('orders'),
      },
      {
        label: 'In-Store',
        value: formatNumber(metrics.ordersByTypeToday.inStore),
        onClick: () => handleDrilldown('orders'),
      },
      {
        label: 'Wholesale',
        value: formatNumber(metrics.ordersByTypeToday.wholesale),
        onClick: () => handleDrilldown('orders'),
      },
    ]
  }, [handleDrilldown, metrics.ordersByTypeToday])

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Stack space={2}>
            <Heading size={3}>Business Overview</Heading>
            <Text muted size={1}>
              Unified snapshot of orders, appointments, work orders, and revenue.
            </Text>
          </Stack>
          <Flex gap={3}>
            <Select
              value={range}
              onChange={(event) => setRange(event.currentTarget.value as DateRangeValue)}
            >
              {DATE_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              icon={ResetIcon}
              mode="ghost"
              text="Refresh"
              tone="primary"
              onClick={handleRefresh}
              disabled={loading}
            />
          </Flex>
        </Flex>

        {error && (
          <Card tone="critical" padding={4} radius={3}>
            <Stack space={3}>
              <Text weight="semibold">Unable to load dashboard data</Text>
              <Text size={1}>{error}</Text>
              <Button text="Try again" tone="critical" onClick={fetchData} />
            </Stack>
          </Card>
        )}

        {!data && loading ? (
          <Card padding={6} radius={3}>
            <Flex align="center" justify="center" style={{minHeight: 240}}>
              <Spinner muted />
            </Flex>
          </Card>
        ) : (
          <>
            <Card padding={4} radius={3} shadow={1}>
              <Stack space={4}>
                <Flex align="center" justify="space-between">
                  <Heading size={2}>Today&apos;s Snapshot</Heading>
                  <Text muted size={1}>
                    Real-time updates based on published data
                  </Text>
                </Flex>
                <Grid columns={[1, 2, 4]} gap={4}>
                  <MetricCard
                    title="Revenue Today"
                    value={formatCurrency(metrics.revenueToday)}
                    icon={<BillIcon />}
                    color="primary"
                    onClick={() => handleDrilldown('orders')}
                    isLoading={loading}
                  />
                  <MetricCard
                    title="Orders Today"
                    value={formatNumber(metrics.ordersTodayCount)}
                    icon={<ClipboardIcon />}
                    onClick={() => handleDrilldown('orders')}
                    isLoading={loading}
                  />
                  <MetricCard
                    title="Appointments"
                    value={formatNumber(data?.appointmentsToday ?? 0)}
                    icon={<CalendarIcon />}
                    onClick={() => handleDrilldown('appointments')}
                    isLoading={loading}
                  />
                  <MetricCard
                    title="Active Work Orders"
                    value={formatNumber(data?.activeWorkOrders ?? 0)}
                    icon={<WrenchIcon />}
                    onClick={() => handleDrilldown('workOrders')}
                    isLoading={loading}
                  />
                </Grid>
                <StatsList items={ordersByTypeList} columns={3} />
              </Stack>
            </Card>

            <Grid columns={[1, 1, 2]} gap={4}>
              <Card padding={4} radius={3} shadow={1}>
                <Stack space={4}>
                  <Heading size={1}>Revenue by Channel</Heading>
                  <ChartCard
                    type="bar"
                    title=""
                    data={revenueByChannelChart}
                    categoryKey="label"
                    valueKey="value"
                    formatValue={(value) => formatCurrency(value)}
                    isLoading={loading}
                    emptyState="No revenue recorded for this period."
                  />
                </Stack>
              </Card>
              <Card padding={4} radius={3} shadow={1}>
                <Stack space={4}>
                  <Heading size={1}>Key Metrics</Heading>
                  <Grid columns={[1, 2]} gap={3}>
                    <MetricCard
                      title="Total Revenue"
                      value={formatCurrency(metrics.periodRevenue)}
                      change={revenueChange ?? undefined}
                      icon={<BillIcon />}
                      color="positive"
                    description={`vs previous: ${formatChange(
                      metrics.periodRevenue,
                      metrics.previousRevenue,
                    )}`}
                    onClick={() => handleDrilldown('orders')}
                    isLoading={loading}
                  />
                    <MetricCard
                      title="Total Orders"
                      value={formatNumber(metrics.periodOrdersCount)}
                      change={orderChange ?? undefined}
                      icon={<ClipboardIcon />}
                      description={`vs previous: ${formatChange(
                        metrics.periodOrdersCount,
                        metrics.previousOrdersCount,
                      )}`}
                      onClick={() => handleDrilldown('orders')}
                      isLoading={loading}
                    />
                    <MetricCard
                      title="Average Order Value"
                      value={formatCurrency(
                        metrics.periodRevenue / Math.max(metrics.periodOrdersCount, 1),
                      )}
                      icon={<PackageIcon />}
                      onClick={() => handleDrilldown('orders')}
                      isLoading={loading}
                    />
                    <MetricCard
                      title="New Customers"
                      value={formatNumber(data?.newCustomers ?? 0)}
                      icon={<UsersIcon />}
                      onClick={() => handleDrilldown('customers')}
                      isLoading={loading}
                    />
                  </Grid>
                </Stack>
              </Card>
            </Grid>

            <Card padding={4} radius={3} shadow={1}>
              <Stack space={4}>
                <Heading size={2}>Alerts &amp; Actions Needed</Heading>
                <Grid columns={[1, 2, 3]} gap={3}>
                  <AlertCard
                    title="Vendor Applications"
                    count={formatNumber(data?.alerts?.vendorApplications ?? 0)}
                    severity="warning"
                    description="Pending approvals"
                    onClick={() => handleDrilldown('vendorApplications')}
                    isLoading={loading}
                  />
                  <AlertCard
                    title="Quotes Awaiting Approval"
                    count={formatNumber(data?.alerts?.vendorQuotes ?? 0)}
                    severity="warning"
                    description="Vendors waiting feedback"
                    onClick={() => handleDrilldown('vendorQuotes')}
                    isLoading={loading}
                  />
                  <AlertCard
                    title="Orders Need Fulfillment"
                    count={formatNumber(data?.alerts?.ordersNeedFulfillment ?? 0)}
                    severity="error"
                    description="Paid orders with no fulfillment"
                    onClick={() => handleDrilldown('orders')}
                    isLoading={loading}
                  />
                  <AlertCard
                    title="Vendors Over Credit Limit"
                    count={formatNumber(data?.alerts?.vendorsOverCredit ?? 0)}
                    severity="error"
                    description="Review credit usage"
                    onClick={() => handleDrilldown('vendors')}
                    isLoading={loading}
                  />
                  <AlertCard
                    title="Products Low Stock"
                    count={formatNumber(data?.alerts?.productsLowStock ?? 0)}
                    severity="warning"
                    description="Inventory below reorder point"
                    onClick={() => handleDrilldown('products')}
                    isLoading={loading}
                  />
                  <AlertCard
                    title="Work Orders Waiting Parts"
                    count={formatNumber(data?.alerts?.workOrdersWaitingParts ?? 0)}
                    severity="warning"
                    description="Follow up with vendors"
                    onClick={() => handleDrilldown('workOrders')}
                    isLoading={loading}
                  />
                  <AlertCard
                    title="Appointments Need Confirmation"
                    count={formatNumber(data?.alerts?.appointmentsNeedConfirmation ?? 0)}
                    severity="info"
                    description="Upcoming within 7 days"
                    onClick={() => handleDrilldown('appointments')}
                    isLoading={loading}
                  />
                </Grid>
              </Stack>
            </Card>

            <Card padding={4} radius={3} shadow={1}>
              <Stack space={4}>
                <Heading size={2}>Quick Stats</Heading>
                <StatsList
                  columns={2}
                  items={[
                    {
                      label: 'Customers',
                      value: formatNumber(data?.quickStats?.customers ?? 0),
                      onClick: () => handleDrilldown('customers'),
                    },
                    {
                      label: 'Active Vendors',
                      value: formatNumber(data?.quickStats?.vendors ?? 0),
                      onClick: () => handleDrilldown('vendors'),
                    },
                    {
                      label: 'Products',
                      value: formatNumber(data?.quickStats?.products ?? 0),
                      onClick: () => handleDrilldown('products'),
                    },
                    {
                      label: 'Services',
                      value: formatNumber(data?.quickStats?.services ?? 0),
                      onClick: () => handleDrilldown('services'),
                    },
                  ]}
                />
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Box>
  )
})

export default HomeDashboard
