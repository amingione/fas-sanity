import {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Stack,
  Text,
  Tooltip,
} from '@sanity/ui'
import {DownloadIcon, RefreshIcon} from '@sanity/icons'
import {
  exportProfitLossCsv,
  exportProfitLossPdf,
  exportRevenueReportCsv,
  type ProfitLossSnapshot,
  type RevenueExportRow,
} from '../../utils/financeExports'

const API_VERSION = '2024-10-01'

type ProfitLossOverview = ProfitLossSnapshot & {
  cogs?: number
}

type RevenueChannels = {
  onlineRevenue: number
  inStoreRevenue: number
  wholesaleRevenue: number
  onlineCogs: number
  inStoreCogs: number
  wholesaleCogs: number
}

type CashFlowSnapshot = {
  totalCashIn?: number
  totalCashOut?: number
  netCashFlow?: number
  endingBalance?: number
  accountsReceivable?: number
  accountsPayable?: number
  cashFromSales?: number
  cashFromWholesale?: number
}

type TrendPoint = {
  period: string
  netRevenue?: number
  netProfit?: number
  netMargin?: number
}

type ExpenseBreakdown = Array<{category: string; total: number}>

type DashboardQueryResult = {
  profitLoss: ProfitLossOverview | null
  expenses: Array<{category?: string; amount?: number}>
  channelOrders: Array<{orderType?: string | null; totalAmount?: number | null}>
  channelTransactions: Array<{
    quantity?: number | null
    unitCost?: number | null
    referenceDoc?: {orderType?: string | null} | null
  }>
  cashFlow: CashFlowSnapshot | null
  trend: TrendPoint[]
}

const DASHBOARD_QUERY = `
{
  "profitLoss": *[_type == "profitLoss" && period == $currentPeriod][0]{
    period,
    netRevenue,
    cogs,
    totalExpenses,
    netProfit,
    netMargin,
    grossMargin,
    grossRevenue,
    returns,
    revenueOnline,
    revenueInStore,
    revenueWholesale,
    operatingProfit,
    avgOrderValue,
    avgProfitPerOrder
  },
  "expenses": *[_type == "expense" && date >= $thisMonth && status == "paid"]{
    category,
    amount
  },
  "channelOrders": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    status == "paid" &&
    _createdAt >= $thisMonth
  ]{
    orderType,
    totalAmount
  },
  "channelTransactions": *[
    _type == "inventoryTransaction" &&
    type == "sold" &&
    transactionDate >= $thisMonth
  ]{
    quantity,
    unitCost,
    referenceDoc->{orderType}
  },
  "cashFlow": *[_type == "cashFlow" && period == $currentPeriod][0]{
    totalCashIn,
    totalCashOut,
    netCashFlow,
    endingBalance,
    accountsReceivable,
    accountsPayable,
    cashFromSales,
    cashFromWholesale
  },
  "trend": *[_type == "profitLoss" && period >= $twelveMonthsAgo] | order(period asc){
    period,
    netRevenue,
    netProfit,
    netMargin
  }
}
`

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

const PIE_COLORS = [
  '#2563EB',
  '#F97316',
  '#0EA5E9',
  '#10B981',
  '#A855F7',
  '#EC4899',
  '#F59E0B',
  '#475569',
]

const startOfMonthUtc = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
const addMonthsUtc = (date: Date, offset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
const formatPeriod = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const groupExpenses = (entries: Array<{category?: string; amount?: number}>): ExpenseBreakdown => {
  const map = new Map<string, number>()
  for (const entry of entries) {
    const key = entry?.category || 'other'
    const amount = Number(entry?.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    map.set(key, (map.get(key) || 0) + amount)
  }
  return Array.from(map.entries())
    .map(([category, total]) => ({category, total}))
    .sort((a, b) => b.total - a.total)
}

const getChannelRows = (channels: RevenueChannels | null | undefined) => {
  if (!channels) return []
  return [
    {
      label: 'Online',
      revenue: channels.onlineRevenue || 0,
      cogs: channels.onlineCogs || 0,
      channel: 'online',
    },
    {
      label: 'In-Store',
      revenue: channels.inStoreRevenue || 0,
      cogs: channels.inStoreCogs || 0,
      channel: 'in-store',
    },
    {
      label: 'Wholesale',
      revenue: channels.wholesaleRevenue || 0,
      cogs: channels.wholesaleCogs || 0,
      channel: 'wholesale',
    },
  ].map((row) => {
    const grossProfit = row.revenue - row.cogs
    const grossMargin = row.revenue > 0 ? (grossProfit / row.revenue) * 100 : 0
    return {...row, grossProfit, grossMargin}
  })
}

const deriveRevenueChannels = (
  orders: Array<{orderType?: string | null; totalAmount?: number | null}>,
  transactions: Array<{
    quantity?: number | null
    unitCost?: number | null
    referenceDoc?: {orderType?: string | null} | null
  }>,
): RevenueChannels => {
  const totals: RevenueChannels = {
    onlineRevenue: 0,
    inStoreRevenue: 0,
    wholesaleRevenue: 0,
    onlineCogs: 0,
    inStoreCogs: 0,
    wholesaleCogs: 0,
  }
  orders.forEach((order) => {
    const amount = Number(order.totalAmount ?? 0)
    if (order.orderType === 'online') totals.onlineRevenue += amount
    else if (order.orderType === 'in-store') totals.inStoreRevenue += amount
    else if (order.orderType === 'wholesale') totals.wholesaleRevenue += amount
  })
  transactions.forEach((txn) => {
    const amount = Number(txn.quantity ?? 0) * Number(txn.unitCost ?? 0)
    const channel = txn.referenceDoc?.orderType
    if (channel === 'online') totals.onlineCogs += amount
    else if (channel === 'in-store') totals.inStoreCogs += amount
    else if (channel === 'wholesale') totals.wholesaleCogs += amount
  })
  return totals
}

const TrendChart = ({data}: {data: TrendPoint[]}) => {
  if (!data?.length) {
    return (
      <Box padding={3}>
        <Text size={1} muted>
          Not enough history to display trends.
        </Text>
      </Box>
    )
  }
  const width = 560
  const height = 220
  const padding = 24
  const revenueMax = Math.max(...data.map((point) => Number(point.netRevenue || 0)), 1)
  const xFor = (index: number) =>
    padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2)
  const yForValue = (value: number) =>
    height - padding - (value / revenueMax) * (height - padding * 2)
  const yForMargin = (value: number) =>
    height - padding - (value / 100) * (height - padding * 2)

  const buildPath = (key: 'netRevenue' | 'netProfit', scale: (value: number) => number) =>
    data
      .map((point, index) => {
        const val = Number(point[key] || 0)
        return `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${scale(val)}`
      })
      .join(' ')

  const revenuePath = buildPath('netRevenue', yForValue)
  const profitPath = buildPath('netProfit', yForValue)
  const marginPath = data
    .map((point, index) => {
      const val = Number(point.netMargin || 0)
      return `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yForMargin(val)}`
    })
    .join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={revenuePath} fill="none" stroke="#2563EB" strokeWidth={2} />
      <path d={profitPath} fill="none" stroke="#22C55E" strokeWidth={2} strokeDasharray="4 4" />
      <path d={marginPath} fill="none" stroke="#F97316" strokeWidth={2} strokeDasharray="2 6" />
      {data.map((point, index) => (
        <text
          key={point.period}
          x={xFor(index)}
          y={height - 4}
          fontSize={10}
          textAnchor="middle"
          fill="#475569"
        >
          {point.period}
        </text>
      ))}
    </svg>
  )
}

const FinancialDashboard = forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: API_VERSION})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overview, setOverview] = useState<ProfitLossOverview | null>(null)
  const [revenueChannels, setRevenueChannels] = useState<RevenueChannels | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowSnapshot | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [expenses, setExpenses] = useState<ExpenseBreakdown>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const monthStart = startOfMonthUtc(now)
      const currentPeriod = formatPeriod(monthStart)
      const twelveMonthsAgo = formatPeriod(addMonthsUtc(monthStart, -11))
      const data = (await client.fetch(DASHBOARD_QUERY, {
        currentPeriod,
        thisMonth: monthStart.toISOString(),
        twelveMonthsAgo,
      })) as DashboardQueryResult
      setOverview(data.profitLoss || null)
      setRevenueChannels(
        deriveRevenueChannels(data.channelOrders || [], data.channelTransactions || []),
      )
      setCashFlow(data.cashFlow || null)
      setTrend(data.trend || [])
      setExpenses(groupExpenses(data.expenses || []))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    refresh()
  }, [refresh])

  const revenueRows = useMemo(() => getChannelRows(revenueChannels), [revenueChannels])

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, entry) => sum + entry.total, 0),
    [expenses],
  )

  const expensePieStyle = useMemo(() => {
    if (!expenses.length || totalExpenses <= 0) return {background: '#E2E8F0'}
    let start = 0
    const segments: string[] = []
    expenses.forEach((entry, index) => {
      const percent = (entry.total / totalExpenses) * 360
      const end = start + percent
      const color = PIE_COLORS[index % PIE_COLORS.length]
      segments.push(`${color} ${start}deg ${end}deg`)
      start = end
    })
    return {background: `conic-gradient(${segments.join(', ')})`}
  }, [expenses, totalExpenses])

  const revenueExportRows = useMemo<RevenueExportRow[]>(() => {
    const totalGross = revenueRows.reduce((sum, row) => sum + row.grossProfit, 0)
    return revenueRows.map((row) => ({
      label: row.label,
      channel: row.channel,
      revenue: row.revenue,
      cogs: row.cogs,
      grossProfit: row.grossProfit,
      grossMargin: row.grossMargin,
      contribution: totalGross > 0 ? (row.grossProfit / totalGross) * 100 : 0,
    }))
  }, [revenueRows])

  const handleProfitLossCsv = () => overview && exportProfitLossCsv(overview)
  const handleProfitLossPdf = () => overview && exportProfitLossPdf(overview)
  const handleRevenueExport = () => revenueExportRows.length && exportRevenueReportCsv(revenueExportRows)

  return (
    <Stack ref={ref} space={4} padding={4}>
      <Flex align="center" justify="space-between">
        <Heading size={3}>📊 Financial Dashboard</Heading>
        <Flex gap={2}>
          <Tooltip content={<Box padding={2}>Refresh data</Box>}>
            <Button
              icon={RefreshIcon}
              mode="ghost"
              tone="primary"
              text="Refresh"
              onClick={refresh}
              disabled={loading}
            />
          </Tooltip>
          <Tooltip content={<Box padding={2}>Export the latest P&amp;L as CSV</Box>}>
            <Button
              icon={DownloadIcon}
              mode="ghost"
              text="Export CSV"
              disabled={!overview}
              onClick={handleProfitLossCsv}
            />
          </Tooltip>
          <Button
            icon={DownloadIcon}
            tone="primary"
            text="Export PDF"
            disabled={!overview}
            onClick={handleProfitLossPdf}
          />
        </Flex>
      </Flex>

      {error && (
        <Card tone="critical" padding={4} radius={2}>
          <Text>{error}</Text>
        </Card>
      )}

      {loading ? (
        <Flex align="center" justify="center" padding={5}>
          <Spinner />
        </Flex>
      ) : (
        <>
          <Card padding={4} radius={3} shadow={1}>
            <Flex justify="space-between" align="center" marginBottom={3}>
              <Heading size={2}>Profit &amp; Loss (This Month)</Heading>
              {overview?.netMargin !== undefined && (
                <Text size={1} muted>
                  Gross Margin {overview.grossMargin?.toFixed(1)}% · Net Margin{' '}
                  {overview.netMargin?.toFixed(1)}%
                </Text>
              )}
            </Flex>
            <Grid columns={[1, 2, 5]} gap={3}>
              <MetricCard label="Net Revenue" value={overview?.netRevenue} />
              <MetricCard label="COGS" value={overview?.cogs} muted />
              <MetricCard label="Expenses" value={overview?.totalExpenses} muted />
              <MetricCard label="Net Profit" value={overview?.netProfit} accent />
              <MetricCard
                label="Net Margin"
                value={
                  typeof overview?.netMargin === 'number'
                    ? `${overview.netMargin.toFixed(1)}%`
                    : undefined
                }
              />
            </Grid>
          </Card>

          <Card padding={4} radius={3} shadow={1}>
            <Flex justify="space-between" align="center" marginBottom={3}>
              <Heading size={2}>Revenue by Channel</Heading>
              <Button
                icon={DownloadIcon}
                text="Export Revenue CSV"
                mode="ghost"
                disabled={!revenueExportRows.length}
                onClick={handleRevenueExport}
              />
            </Flex>
            <Grid columns={[1, 3]} gap={3}>
              {revenueRows.map((row) => (
                <Card key={row.label} padding={3} tone="transparent" border radius={2}>
                  <Stack space={2}>
                    <Text size={1} weight="semibold">
                      {row.label}
                    </Text>
                    <Text size={3}>{currency.format(row.revenue)}</Text>
                    <Text size={1} muted>
                      COGS {currency.format(row.cogs)}
                    </Text>
                    <Text size={1} style={{color: 'var(--card-positive-fg-color)'}}>
                      Margin {row.grossMargin.toFixed(1)}%
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Grid>
          </Card>

          <Grid columns={[1, 2]} gap={4}>
            <Card padding={4} radius={3} shadow={1}>
              <Box marginBottom={3}>
                <Heading size={2}>Expense Breakdown</Heading>
              </Box>
              <Flex gap={4} wrap="wrap">
                <Box
                  style={{
                    width: 160,
                    height: 160,
                    borderRadius: '50%',
                    ...expensePieStyle,
                  }}
                />
                <Stack space={2} flex={1}>
                  {expenses.map((entry, index) => (
                    <Flex key={entry.category} align="center" justify="space-between">
                      <Flex align="center" gap={2}>
                        <Box
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                          }}
                        />
                        <Text size={1}>{entry.category}</Text>
                      </Flex>
                      <Text size={1}>{currency.format(entry.total)}</Text>
                    </Flex>
                  ))}
                  {!expenses.length && (
                    <Text size={1} muted>
                      No paid expenses recorded this month.
                    </Text>
                  )}
                </Stack>
              </Flex>
            </Card>

            <Card padding={4} radius={3} shadow={1}>
              <Box marginBottom={3}>
                <Heading size={2}>Cash Flow</Heading>
              </Box>
              <Grid columns={[1, 2]} gap={3}>
                <MetricCard label="Cash In" value={cashFlow?.totalCashIn} />
                <MetricCard label="Cash Out" value={cashFlow?.totalCashOut} muted />
                <MetricCard label="Net Cash Flow" value={cashFlow?.netCashFlow} accent />
                <MetricCard label="Ending Balance" value={cashFlow?.endingBalance} />
              </Grid>
              <Stack marginTop={3} space={2}>
                <Text size={1} muted>
                  Accounts Receivable: {currency.format(cashFlow?.accountsReceivable || 0)}
                </Text>
                <Text size={1} muted>
                  Accounts Payable: {currency.format(cashFlow?.accountsPayable || 0)}
                </Text>
              </Stack>
            </Card>
          </Grid>

          <Card padding={4} radius={3} shadow={1}>
            <Box marginBottom={3}>
              <Heading size={2}>Performance Trends (12 months)</Heading>
            </Box>
            <TrendChart data={trend} />
          </Card>
        </>
      )}
    </Stack>
  )
});

const MetricCard = ({
  label,
  value,
  muted,
  accent,
}: {
  label: string
  value?: number | string | null
  muted?: boolean
  accent?: boolean
}) => {
  const displayValue =
    typeof value === 'number'
      ? currency.format(value)
      : typeof value === 'string'
      ? value
      : currency.format(0)

  return (
    <Card padding={3} radius={2} tone={accent ? 'primary' : 'transparent'} border>
      <Stack space={1}>
        <Text size={1} muted>
          {label}
        </Text>
        <Text
          size={2}
          weight="semibold"
          style={accent ? {color: 'var(--card-positive-fg-color)'} : undefined}
        >
          {displayValue}
        </Text>
      </Stack>
    </Card>
  )
};

export default FinancialDashboard
