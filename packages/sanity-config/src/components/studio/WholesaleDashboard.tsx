import React, {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useRouter} from 'sanity/router'
import {Box, Button, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {DownloadIcon, ResetIcon, UserIcon} from '@sanity/icons'
import {useWorkspaceClient} from '../../utils/useWorkspaceClient'
import {
  formatCurrency,
  formatNumber,
  getThisMonth,
} from '../../utils/dashboardUtils'
import {DataTable, MetricCard, StatsList} from './dashboard'

const API_VERSION = '2024-10-01'

const WHOLESALE_QUERY = `
{
  "vendorOverview": {
    "total": count(*[_type == "vendor" && !(_id in path("drafts.**"))]),
    "active": count(*[_type == "vendor" && accountStatus == "active"]),
    "onHold": count(*[_type == "vendor" && accountStatus == "on_hold"]),
    "pendingApplications": count(*[_type == "vendorApplication" && status == "pending"])
  },
  "vendors": *[
    _type == "vendor" &&
    !(_id in path("drafts.**"))
  ]{
    _id,
    companyName,
    accountStatus,
    pricingTier,
    creditLimit,
    currentBalance
  },
  "wholesaleOrders": *[
    _type == "order" &&
    orderType == "wholesale" &&
    !(_id in path("drafts.**")) &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($monthStart)
  ]{
    totalAmount,
    status
  },
  "paidWholesaleOrders": *[
    _type == "order" &&
    orderType == "wholesale" &&
    !(_id in path("drafts.**")) &&
    status == "paid"
  ]{
    totalAmount,
    _createdAt,
    customerRef->{_id, companyName, accountStatus, pricingTier}
  },
  "quotesStatus": {
    "draft": count(*[_type == "vendorQuote" && status == "draft"]),
    "sent": count(*[_type == "vendorQuote" && status == "sent"]),
    "approved": count(*[_type == "vendorQuote" && status == "approved"]),
    "readyToConvert": count(*[_type == "vendorQuote" && status == "approved" && !defined(convertedToOrder)]),
    "expired": count(*[_type == "vendorQuote" && validUntil < now()])
  }
}
`

type WholesaleOrder = {
  totalAmount?: number | null
  status?: string | null
}

type VendorRow = {
  _id: string
  companyName?: string | null
  pricingTier?: string | null
  accountStatus?: string | null
  revenue?: number | null
  orderCount?: number | null
  lastOrderDate?: string | null
}

type WholesaleResponse = {
  vendorOverview: Record<string, number>
  vendors: Array<{
    _id: string
    companyName?: string | null
    accountStatus?: string | null
    pricingTier?: string | null
    creditLimit?: number | null
    currentBalance?: number | null
  }>
  wholesaleOrders: WholesaleOrder[]
  paidWholesaleOrders: Array<{
    totalAmount?: number | null
    _createdAt?: string | null
    customerRef?: {
      _id?: string
      companyName?: string | null
      accountStatus?: string | null
      pricingTier?: string | null
    } | null
  }>
  quotesStatus: Record<string, number>
}

export const WholesaleDashboard = forwardRef<HTMLDivElement>(function WholesaleDashboard(
  _props,
  ref,
) {
  const client = useWorkspaceClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [data, setData] = useState<WholesaleResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const monthStart = getThisMonth()

    try {
      const result = await client.fetch<WholesaleResponse>(WHOLESALE_QUERY, {
        monthStart: monthStart.toISOString(),
      })
      setData(result)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load wholesale data')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshIndex])

  const creditStatus = useMemo(() => {
    const vendors = data?.vendors ?? []
    if (!vendors.length) {
      return {totalCredit: 0, outstanding: 0, available: 0, overLimit: 0}
    }
    return vendors.reduce(
      (acc, vendor) => {
        const creditLimit = Number(vendor.creditLimit ?? 0)
        const balance = Number(vendor.currentBalance ?? 0)
        acc.totalCredit += creditLimit
        acc.outstanding += balance
        acc.available += creditLimit - balance
        if (creditLimit > 0 && balance > creditLimit) {
          acc.overLimit += 1
        }
        return acc
      },
      {totalCredit: 0, outstanding: 0, available: 0, overLimit: 0},
    )
  }, [data?.vendors])

  const wholesaleTotals = useMemo(() => {
    const orders = data?.wholesaleOrders ?? []
    const revenue = orders.reduce((sum, order) => sum + (order.totalAmount ?? 0), 0)
    const count = orders.length
    const pending = orders.filter((order) => (order.status || '').toLowerCase() !== 'completed').length
    return {
      revenue,
      count,
      average: count ? revenue / count : 0,
      pending,
    }
  }, [data])

  const creditProgress = useMemo(() => {
    const total = creditStatus.totalCredit
    const outstanding = creditStatus.outstanding
    if (total === 0) return 0
    return Math.min(outstanding / total, 1)
  }, [creditStatus])

  const topVendors = useMemo<VendorRow[]>(() => {
    const orders = data?.paidWholesaleOrders ?? []
    if (!orders.length) return []
    const groups = new Map<string, VendorRow>()
    for (const order of orders) {
      const vendor = order.customerRef
      if (!vendor?._id) continue
      const existing =
        groups.get(vendor._id) ||
        {
          _id: vendor._id,
          companyName: vendor.companyName,
          pricingTier: vendor.pricingTier,
          accountStatus: vendor.accountStatus,
          revenue: 0,
          orderCount: 0,
          lastOrderDate: null,
        }
      const amount = Number(order.totalAmount ?? 0)
      existing.revenue = (existing.revenue ?? 0) + amount
      existing.orderCount = (existing.orderCount ?? 0) + 1
      if (order._createdAt) {
        if (!existing.lastOrderDate || order._createdAt > existing.lastOrderDate) {
          existing.lastOrderDate = order._createdAt
        }
      }
      groups.set(vendor._id, existing)
    }
    return Array.from(groups.values())
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 10)
  }, [data?.paidWholesaleOrders])

  const handleExportVendors = useCallback(() => {
    if (typeof window === 'undefined' || !topVendors.length) return
    const rows = [
      ['Vendor', 'Pricing Tier', 'Revenue', 'Orders', 'Last Order'],
      ...topVendors.map((vendor) => [
        vendor.companyName || 'Vendor',
        vendor.pricingTier || '—',
        (vendor.revenue ?? 0).toFixed(2),
        vendor.orderCount ?? 0,
        vendor.lastOrderDate || '',
      ]),
    ]
    const csv = rows.map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wholesale-vendors.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [topVendors])

  const goToVendor = useCallback(
    (id: string) => {
      if (router.navigateIntent) {
        router.navigateIntent('edit', {id, type: 'vendor'})
      }
    },
    [router],
  )

  const handleCreateQuote = useCallback(() => {
    router.navigateIntent?.('create', {type: 'vendorQuote'})
  }, [router])

  const handleViewApplications = useCallback(() => {
    if (router.navigateUrl) {
      router.navigateUrl({path: '/desk/wholesale-manufacturing;vendor-applications'})
    }
  }, [router])

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Stack space={2}>
            <Heading size={3}>Wholesale Dashboard</Heading>
            <Text muted size={1}>Monitor vendor health, credit exposure, and quotes.</Text>
          </Stack>
          <Flex gap={3}>
            <Button
              icon={DownloadIcon}
              text="Export Vendors"
              tone="primary"
              mode="ghost"
              onClick={handleExportVendors}
              disabled={!topVendors.length}
            />
            <Button
              icon={ResetIcon}
              text="Refresh"
              mode="ghost"
              tone="primary"
              onClick={() => setRefreshIndex((prev) => prev + 1)}
              disabled={loading}
            />
          </Flex>
        </Flex>

        {error ? (
          <Card tone="critical" padding={4}>
            <Stack space={3}>
              <Text weight="bold">Unable to load wholesale data</Text>
              <Text size={1}>{error}</Text>
              <Button text="Try again" tone="critical" onClick={fetchData} />
            </Stack>
          </Card>
        ) : null}

        <Grid columns={[1, 1, 2]} gap={4}>
          <Card padding={4} radius={3} shadow={1}>
            <Stack space={3}>
              <Heading size={2}>Vendor Overview</Heading>
              <StatsList
                columns={2}
                items={[
                  {label: 'Total Vendors', value: formatNumber(data?.vendorOverview?.total ?? 0)},
                  {label: 'Active', value: formatNumber(data?.vendorOverview?.active ?? 0)},
                  {label: 'On Hold', value: formatNumber(data?.vendorOverview?.onHold ?? 0)},
                  {
                    label: 'Pending Applications',
                    value: formatNumber(data?.vendorOverview?.pendingApplications ?? 0),
                    onClick: handleViewApplications,
                    tone: 'caution',
                  },
                ]}
              />
            </Stack>
          </Card>

          <Card padding={4} radius={3} shadow={1}>
            <Stack space={3}>
              <Heading size={2}>Credit Status</Heading>
              <Text size={1} muted>
                Outstanding vs authorized limits
              </Text>
              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: 'var(--card-border-color)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(creditProgress * 100).toFixed(1)}%`,
                    height: '100%',
                    background:
                      creditProgress > 0.8
                        ? 'var(--card-focus-ring-color-critical)'
                        : 'var(--card-focus-ring-color-positive)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <Flex justify="space-between">
                <Text size={1}>Outstanding: {formatCurrency(creditStatus.outstanding)}</Text>
                <Text size={1}>Total Limit: {formatCurrency(creditStatus.totalCredit)}</Text>
              </Flex>
              <StatsList
                columns={2}
                items={[
                  {
                    label: 'Available Credit',
                    value: formatCurrency(creditStatus.available),
                  },
                  {
                    label: 'Over Limit',
                    value: formatNumber(creditStatus.overLimit),
                    tone: 'critical',
                    onClick: () =>
                      router.navigateUrl?.({
                        path: '/desk/wholesale-manufacturing;wholesale-vendors',
                      }),
                  },
                ]}
              />
            </Stack>
          </Card>
        </Grid>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Heading size={2}>Wholesale Orders (This Month)</Heading>
            <Grid columns={[1, 1, 3]} gap={3}>
              <MetricCard
                title="Revenue"
                value={formatCurrency(wholesaleTotals.revenue)}
                color="primary"
              />
              <MetricCard title="Orders" value={formatNumber(wholesaleTotals.count)} />
              <MetricCard title="Average Order" value={formatCurrency(wholesaleTotals.average)} />
              <MetricCard
                title="Pending Orders"
                value={formatNumber(wholesaleTotals.pending)}
                color="caution"
              />
            </Grid>
          </Stack>
        </Card>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Flex align="center" justify="space-between">
              <Heading size={2}>Top Vendors</Heading>
              <Button
                icon={UserIcon}
                text="New Quote"
                tone="primary"
                onClick={handleCreateQuote}
              />
            </Flex>
            <DataTable
              columns={[
                {key: 'companyName', title: 'Vendor', sortable: true},
                {key: 'pricingTier', title: 'Tier'},
                {
                  key: 'revenue',
                  title: 'Revenue',
                  align: 'right',
                  render: (row: VendorRow) => formatCurrency(row.revenue ?? 0),
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
                  render: (row: VendorRow) =>
                    row.lastOrderDate ? new Date(row.lastOrderDate).toLocaleDateString() : '—',
                },
              ]}
              data={topVendors}
              isLoading={loading}
              pageSize={10}
              searchableKeys={['companyName', 'pricingTier']}
              rowKey={(row) => row._id}
              onRowClick={(row) => goToVendor(row._id)}
              emptyState="No vendor revenue yet."
            />
          </Stack>
        </Card>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Heading size={2}>Quotes Status</Heading>
            <StatsList
              columns={3}
              items={[
                {label: 'Draft', value: formatNumber(data?.quotesStatus?.draft ?? 0)},
                {label: 'Sent', value: formatNumber(data?.quotesStatus?.sent ?? 0)},
                {label: 'Approved', value: formatNumber(data?.quotesStatus?.approved ?? 0)},
                {
                  label: 'Ready to Convert',
                  value: formatNumber(data?.quotesStatus?.readyToConvert ?? 0),
                  tone: 'positive',
                  onClick: () =>
                    router.navigateUrl?.({path: '/desk/wholesale-manufacturing;vendor-quotes'}),
                },
                {
                  label: 'Expired',
                  value: formatNumber(data?.quotesStatus?.expired ?? 0),
                  tone: 'critical',
                },
              ]}
            />
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
})

WholesaleDashboard.displayName = 'WholesaleDashboard'

export default WholesaleDashboard
