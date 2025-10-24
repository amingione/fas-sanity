import React, {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {ArrowLeftIcon, ArrowRightIcon} from '@sanity/icons'
import {format, formatDistanceToNow} from 'date-fns'

const DAY = 24 * 60 * 60 * 1000
const LOOKBACK_DAYS = 365
const CASHFLOW_MONTHS = 12

const RANGE_PRESETS = [
  {label: '30 days', value: 30},
  {label: '90 days', value: 90},
  {label: '365 days', value: 365},
] as const

type RangePreset = (typeof RANGE_PRESETS)[number]['value']

type IntegrationKey = 'orders' | 'payouts' | 'analytics'

const DASHBOARD_QUERY = `{
  "orders": *[
    _type == "order" &&
    !(_id in path("drafts.**")) &&
    defined(totalAmount) &&
    dateTime(coalesce(createdAt, _createdAt)) >= dateTime($start)
  ]{
    _id,
    createdAt,
    _createdAt,
    totalAmount,
    amountSubtotal,
    amountTax,
    amountShipping,
    status,
    paymentStatus
  } | order(coalesce(createdAt, _createdAt) desc),
  "invoices": *[
    _type == "invoice" &&
    !(_id in path("drafts.**")) &&
    dateTime(coalesce(invoiceDate, _createdAt)) >= dateTime($start)
  ]{
    _id,
    invoiceDate,
    _createdAt,
    dueDate,
    status,
    total,
    amount,
    amountSubtotal,
    amountTax,
    invoiceNumber,
    orderNumber
  } | order(coalesce(invoiceDate, _createdAt) desc),
  "expenses": *[
    _type == "expense" &&
    !(_id in path("drafts.**")) &&
    dateTime(coalesce(date, _createdAt)) >= dateTime($start)
  ]{
    _id,
    date,
    _createdAt,
    amount,
    category
  } | order(coalesce(date, _createdAt) desc)
}`

type RawOrder = {
  _id: string
  createdAt?: string
  _createdAt?: string
  totalAmount?: number | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  status?: string | null
  paymentStatus?: string | null
}

type RawInvoice = {
  _id: string
  invoiceDate?: string | null
  _createdAt?: string | null
  dueDate?: string | null
  status?: string | null
  total?: number | null
  amount?: number | null
  amountSubtotal?: number | null
  amountTax?: number | null
}

type RawExpense = {
  _id: string
  date?: string | null
  _createdAt?: string | null
  amount?: number | null
  category?: string | null
}

type FetchResult = {
  orders: RawOrder[]
  invoices: RawInvoice[]
  expenses: RawExpense[]
}

type NormalizedOrder = {
  id: string
  timestamp: number
  total: number
  status: string
  paymentStatus: string
}

type NormalizedInvoice = {
  id: string
  timestamp: number
  dueTimestamp: number | null
  total: number
  status: string
}

type NormalizedExpense = {
  id: string
  timestamp: number
  amount: number
  category: string
}

type NormalizedData = {
  orders: NormalizedOrder[]
  invoices: NormalizedInvoice[]
  expenses: NormalizedExpense[]
}

type CategoryBreakdown = {
  category: string
  total: number
}

type SalesPoint = {
  date: number
  total: number
}

type CashflowPoint = {
  label: string
  income: number
  expense: number
  net: number
}

type Summary = {
  rangeStart: number
  rangeEnd: number
  generatedAt: number
  orderCount: number
  grossSales: number
  previousGrossSales: number
  grossChangePct: number | null
  netSales: number
  previousNetSales: number
  netChangePct: number | null
  refunds: number
  averageOrder: number
  expenseTotal: number
  previousExpenseTotal: number
  expenseChangePct: number | null
  netProfit: number
  previousNetProfit: number
  netProfitChangePct: number | null
  expenseCategories: CategoryBreakdown[]
  outstanding: number
  overdue: number
  overdueCount: number
  dueSoonCount: number
  dueSoonTotal: number
  notDueTotal: number
  paidLast30: number
  unpaidLast30: number
  invoiceCountLast30: number
  salesSeries: SalesPoint[]
  cashflowSeries: CashflowPoint[]
}

type TrafficResponse = {
  range: {start: string; end: string}
  totals: {visitors: number; pageviews: number; sessions: number}
  daily: Array<{date: string; visitors: number; pageviews: number; sessions: number}>
}

type TrafficSummary = {
  visitors: number
  pageviews: number
  sessions: number
  trend: number[]
  trendDates: number[]
  recentDaily: Array<{date: number; visitors: number; pageviews: number; sessions: number}>
}

type PayoutResponse = {
  currency: string
  nextArrival?: string
  nextAmount?: number
  pendingBalance: number
  availableBalance: number
  recentPayouts: Array<{
    id: string
    arrivalDate: string
    amount: number
    status: string
    method: string
  }>
}

type PayoutSummary = {
  currency: string
  nextArrival?: number
  nextAmount?: number
  pending: number
  available: number
  recent: Array<{id: string; arrival: number; amount: number; status: string; method: string}>
}

const FinancialDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [raw, setRaw] = useState<FetchResult | null>(null)
  const [traffic, setTraffic] = useState<TrafficSummary | null>(null)
  const [payouts, setPayouts] = useState<PayoutSummary | null>(null)
  const [range, setRange] = useState<RangePreset>(30)
  const [activeIntegration, setActiveIntegration] = useState<IntegrationKey | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const start = new Date(Date.now() - LOOKBACK_DAYS * DAY).toISOString()
        const [sanityResult, trafficResult, payoutResult] = await Promise.all([
          client.fetch<FetchResult>(DASHBOARD_QUERY, {start}),
          fetch(`/.netlify/functions/fetchSiteTraffic?start=${encodeURIComponent(start)}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch((err) => {
              console.warn('traffic fetch failed', err)
              return null
            }),
          fetch('/.netlify/functions/fetchStripePayouts')
            .then((res) => (res.ok ? res.json() : null))
            .catch((err) => {
              console.warn('payout fetch failed', err)
              return null
            }),
        ])

        if (cancelled) return
        setRaw(sanityResult)
        setTraffic(trafficResult ? summarizeTraffic(trafficResult as TrafficResponse) : null)
        setPayouts(payoutResult ? summarizePayout(payoutResult as PayoutResponse) : null)
      } catch (err: any) {
        console.error('Financial dashboard load failed', err)
        if (!cancelled) setError(err?.message || 'Unable to load financial dashboard data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [client])

  const normalized = useMemo(() => (raw ? normalize(raw) : null), [raw])
  const summary = useMemo(() => (normalized ? summarize(normalized, range) : null), [normalized, range])

  const handleRangeChange = (value: RangePreset) => setRange(value)
  const handleCreateInvoice = () => router.navigateIntent('create', {type: 'invoice'})
  const handleCreateOrder = () => router.navigateIntent('create', {type: 'order'})

  return (
    <Box
      ref={ref}
      padding={[3, 4, 5]}
      style={{
        background: 'var(--studio-surface-overlay)',
        minHeight: '100%',
        borderRadius: '28px',
        border: '1px solid var(--studio-border)',
        boxShadow: 'var(--studio-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <Stack space={4}>
        <Flex
          align="center"
          justify="space-between"
          gap={3}
          style={{flexWrap: 'wrap'}}
        >
          <Stack space={1}>
            <Heading size={3}>Financial dashboard</Heading>
            {summary ? (
              <Text size={1} muted>
                Updated {formatDistanceToNow(new Date(summary.generatedAt), {addSuffix: true})}
              </Text>
            ) : null}
          </Stack>
          <Flex gap={2} style={{flexWrap: 'wrap'}}>
            {RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                text={preset.label}
                tone={range === preset.value ? 'primary' : 'default'}
                mode={range === preset.value ? 'default' : 'ghost'}
                onClick={() => handleRangeChange(preset.value)}
              />
            ))}
            <Button text="Create invoice" tone="primary" onClick={handleCreateInvoice} />
            <Button text="Record order" onClick={handleCreateOrder} />
          </Flex>
        </Flex>

        {loading ? (
          <Card padding={6} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
            <Flex align="center" justify="center" direction="column" gap={3}>
              <Spinner muted />
              <Text muted>Preparing your financial insights…</Text>
            </Flex>
          </Card>
        ) : error ? (
          <Card padding={5} radius={4} shadow={1} tone="critical">
            <Stack space={3}>
              <Heading size={2}>Unable to load dashboard</Heading>
              <Text muted size={1}>{error}</Text>
            </Stack>
          </Card>
        ) : summary && normalized ? (
          activeIntegration ? (
            <IntegrationDetailView
              integration={activeIntegration}
              summary={summary}
              normalized={normalized}
              payouts={payouts}
              traffic={traffic}
              onBack={() => setActiveIntegration(null)}
              range={range}
            />
          ) : (
            <Box
              style={{
                display: 'grid',
                gap: '16px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              }}
            >
              <ProfitLossCard summary={summary} range={range} />
              <ExpensesCard summary={summary} />
              <CashFlowCard summary={summary} />
              <InvoicesCard summary={summary} range={range} />
              <SalesCard summary={summary} />
              <Stack space={3} style={{minWidth: '300px'}}>
                <IntegrationsCard
                  summary={summary}
                  traffic={traffic}
                  payouts={payouts}
                  dataLoaded={!!raw}
                  onSelectIntegration={setActiveIntegration}
                />
                <AccountsReceivableCard summary={summary} />
              </Stack>
            </Box>
          )
        ) : null}
      </Stack>
    </Box>
  )
})

FinancialDashboard.displayName = 'FinancialDashboard'

export default FinancialDashboard

function ProfitLossCard({summary, range}: {summary: Summary; range: RangePreset}) {
  const income = summary.netSales
  const expenses = summary.expenseTotal
  const net = summary.netProfit
  const netChange = summary.netProfitChangePct
  const previousTransactions = number(summary.orderCount)
  const incomeShare = income + expenses > 0 ? (income / (income + expenses)) * 100 : 0
  const expenseShare = income + expenses > 0 ? (expenses / (income + expenses)) * 100 : 0

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Stack space={1}>
            <Heading size={2}>Profit &amp; loss</Heading>
            <Text size={1} muted>
              Net profit for the last {range} days
            </Text>
          </Stack>
          <TrendBadge value={netChange} />
        </Flex>

        <Stack space={2}>
          <Text size={1} muted>Net profit</Text>
          <Heading size={4}>{currency(net)}</Heading>
        </Stack>

        <Stack space={3}>
          <ProgressStat
            label="Income"
            value={currency(income)}
            change={summary.netChangePct}
            percent={incomeShare}
            tone="positive"
          />
          <ProgressStat
            label="Expenses"
            value={currency(expenses)}
            change={summary.expenseChangePct}
            percent={expenseShare}
            tone="critical"
          />
        </Stack>

        <Flex
          justify="space-between"
          align="center"
          gap={2}
          style={{flexWrap: 'wrap'}}
        >
          <Text size={1} muted>
            {previousTransactions} transactions this period
          </Text>
          <Button as="a" href="/desk/expense" text="Categorize transactions" mode="ghost" />
        </Flex>
      </Stack>
    </Card>
  )
}

function ExpensesCard({summary}: {summary: Summary}) {
  const total = summary.expenseTotal
  const change = summary.expenseChangePct
  const categories = buildCategorySegments(summary.expenseCategories)

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Stack space={1}>
            <Heading size={2}>Expenses</Heading>
            <Text size={1} muted>Spending for this period</Text>
          </Stack>
          <TrendBadge value={change} />
        </Flex>

        <Flex align="center" gap={4} style={{flexWrap: 'wrap'}}>
          <DonutChart
            size={140}
            thickness={28}
            segments={categories.map((entry) => ({label: entry.category, value: entry.total, color: entry.color}))}
            total={total}
          >
            <Flex direction="column" align="center" gap={1}>
              <Text size={1} muted>Total spend</Text>
              <Text weight="semibold">{currency(total)}</Text>
            </Flex>
          </DonutChart>

          <Stack space={2} flex={1}>
            {categories.map((entry) => (
              <LegendRow
                key={entry.category}
                label={entry.category}
                value={currency(entry.total)}
                percent={total > 0 ? (entry.total / total) * 100 : 0}
                color={entry.color}
              />
            ))}
          </Stack>
        </Flex>
      </Stack>
    </Card>
  )
}

function CashFlowCard({summary}: {summary: Summary}) {
  const net = summary.cashflowSeries.reduce((acc, point) => acc + point.net, 0)
  const moneyIn = summary.cashflowSeries.reduce((acc, point) => acc + point.income, 0)
  const moneyOut = summary.cashflowSeries.reduce((acc, point) => acc + point.expense, 0)

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Stack space={1}>
            <Heading size={2}>Cash flow trend</Heading>
            <Text size={1} muted>Net movement over the last {CASHFLOW_MONTHS} months</Text>
          </Stack>
          <Badge tone={net >= 0 ? 'positive' : 'critical'}>{currency(net)}</Badge>
        </Flex>

        <LineChart
          points={summary.cashflowSeries.map((point) => point.net)}
          labels={summary.cashflowSeries.map((point) => point.label)}
          stroke="rgba(34, 197, 94, 0.9)"
          background="rgba(34, 197, 94, 0.15)"
          height={120}
        />

        <Flex gap={3} style={{flexWrap: 'wrap'}}>
          <SnapshotMetric label="Money in" value={moneyIn} tone="positive" />
          <SnapshotMetric label="Money out" value={moneyOut} tone="critical" />
        </Flex>
      </Stack>
    </Card>
  )
}

function InvoicesCard({summary, range}: {summary: Summary; range: RangePreset}) {
  const overduePct = summary.outstanding > 0 ? (summary.overdue / summary.outstanding) * 100 : 0
  const dueSoonPct = summary.outstanding > 0 ? (summary.dueSoonTotal / summary.outstanding) * 100 : 0
  const paidPct = summary.paidLast30 + summary.unpaidLast30 > 0 ? (summary.paidLast30 / (summary.paidLast30 + summary.unpaidLast30)) * 100 : 0

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Stack space={1}>
            <Heading size={2}>Invoices</Heading>
            <Text size={1} muted>Outstanding last {range} days</Text>
          </Stack>
          <Badge tone={summary.overdueCount > 0 ? 'critical' : 'positive'}>
            {summary.overdueCount > 0 ? `${summary.overdueCount} overdue` : 'Up to date'}
          </Badge>
        </Flex>

        <Stack space={2}>
          <Flex justify="space-between" align="center">
            <Text size={1} muted>Total outstanding</Text>
            <Text weight="semibold">{currency(summary.outstanding)}</Text>
          </Flex>
          <FullWidthBar>
            <Segment width={overduePct} color="#ef4444" label="Overdue" />
            <Segment width={dueSoonPct} color="#f97316" label="Due soon" />
            <Segment width={Math.max(0, 100 - overduePct - dueSoonPct)} color="#0ea5e9" label="Current" />
          </FullWidthBar>
          <Flex justify="space-between">
            <Text size={1} muted>Overdue {currency(summary.overdue)}</Text>
            <Text size={1} muted>Not yet due {currency(summary.notDueTotal)}</Text>
          </Flex>
        </Stack>

        <Stack space={2}>
          <Flex justify="space-between" align="center">
            <Text size={1} muted>Last 30 days</Text>
            <Text size={1} muted>{summary.invoiceCountLast30} invoices</Text>
          </Flex>
          <FullWidthBar>
            <Segment width={paidPct} color="#22c55e" label="Paid" />
            <Segment width={Math.max(0, 100 - paidPct)} color="#facc15" label="Open" />
          </FullWidthBar>
          <Flex justify="space-between">
            <Text size={1} muted>Paid {currency(summary.paidLast30)}</Text>
            <Text size={1} muted>Open {currency(summary.unpaidLast30)}</Text>
          </Flex>
        </Stack>
      </Stack>
    </Card>
  )
}

function SalesCard({summary}: {summary: Summary}) {
  const totalSales = summary.salesSeries.reduce((sum, point) => sum + point.total, 0)
  const average = summary.salesSeries.length > 0 ? totalSales / summary.salesSeries.length : 0

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Stack space={1}>
          <Heading size={2}>Sales</Heading>
          <Text size={1} muted>Last {summary.salesSeries.length} days</Text>
        </Stack>

        <Stack space={2}>
          <Heading size={3}>{currency(totalSales)}</Heading>
          <Text size={1} muted>Average {currency(average)} per day</Text>
        </Stack>

        <LineChart
          points={summary.salesSeries.map((point) => point.total)}
          labels={summary.salesSeries.map((point) => format(new Date(point.date), 'MMM d'))}
          stroke="rgba(14, 165, 233, 0.9)"
          background="rgba(14, 165, 233, 0.15)"
          height={120}
        />
      </Stack>
    </Card>
  )
}

function IntegrationsCard({
  summary,
  traffic,
  payouts,
  dataLoaded,
  onSelectIntegration,
}: {
  summary: Summary
  traffic: TrafficSummary | null
  payouts: PayoutSummary | null
  dataLoaded: boolean
  onSelectIntegration: (integration: IntegrationKey) => void
}) {
  const integrations: Array<{
    key: IntegrationKey
    name: string
    status: string
    tone: 'positive' | 'critical'
    detail: string
  }> = [
    {
      key: 'orders',
      name: 'Sanity orders',
      status: dataLoaded ? 'Connected' : 'With issues',
      tone: dataLoaded ? 'positive' : 'critical',
      detail: `${summary.orderCount} orders analysed`,
    },
    {
      key: 'payouts',
      name: 'Stripe payouts',
      status: payouts ? 'Connected' : 'With issues',
      tone: payouts ? 'positive' : 'critical',
      detail: payouts
        ? payouts.nextArrival
          ? `Next payout ${format(new Date(payouts.nextArrival), 'MMM d')}`
          : 'Pending balance available'
        : 'Connect Stripe payouts',
    },
    {
      key: 'analytics',
      name: 'Site analytics',
      status: traffic ? 'Connected' : 'With issues',
      tone: traffic ? 'positive' : 'critical',
      detail: traffic ? `${number(traffic.visitors)} visitors this period` : 'Connect analytics source',
    },
  ]

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={3}>
        <Heading size={2}>My integrations</Heading>
        <Stack space={2}>
          {integrations.map((integration) => (
            <Card
              key={integration.key}
              padding={3}
              radius={3}
              shadow={0}
              tone="transparent"
              style={{
                background: 'var(--studio-surface-soft)',
                cursor: 'pointer',
              }}
              role="button"
              tabIndex={0}
              aria-label={`View ${integration.name} integration`}
              onClick={() => onSelectIntegration(integration.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectIntegration(integration.key)
                }
              }}
            >
              <Flex
                align="center"
                justify="space-between"
                gap={3}
                style={{flexWrap: 'wrap'}}
              >
                <Stack space={1}>
                  <Text weight="semibold">{integration.name}</Text>
                  <Text size={1} muted>{integration.detail}</Text>
                </Stack>
                <Flex align="center" gap={2}>
                  <Badge tone={integration.tone}>{integration.status}</Badge>
                  <Box style={{color: '#0f172a'}}>
                    <ArrowRightIcon />
                  </Box>
                </Flex>
              </Flex>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}

function IntegrationDetailView({
  integration,
  summary,
  normalized,
  payouts,
  traffic,
  onBack,
  range,
}: {
  integration: IntegrationKey
  summary: Summary
  normalized: NormalizedData
  payouts: PayoutSummary | null
  traffic: TrafficSummary | null
  onBack: () => void
  range: RangePreset
}) {
  const rangeLabel = RANGE_PRESETS.find((preset) => preset.value === range)?.label || `${range} days`

  if (integration === 'orders') {
    return (
      <OrdersIntegrationSection
        summary={summary}
        normalized={normalized}
        onBack={onBack}
        rangeLabel={rangeLabel}
      />
    )
  }

  if (integration === 'payouts') {
    return <PayoutsIntegrationSection payouts={payouts} onBack={onBack} />
  }

  return <AnalyticsIntegrationSection traffic={traffic} onBack={onBack} rangeLabel={rangeLabel} />
}

function OrdersIntegrationSection({
  summary,
  normalized,
  onBack,
  rangeLabel,
}: {
  summary: Summary
  normalized: NormalizedData
  onBack: () => void
  rangeLabel: string
}) {
  const router = useRouter()
  const ordersInRange = normalized.orders
    .filter((order) => order.timestamp >= summary.rangeStart && order.timestamp <= summary.rangeEnd)
    .sort((a, b) => b.timestamp - a.timestamp)

  const statusBreakdown = aggregateCounts(ordersInRange.map((order) => order.status))
  const paymentBreakdown = aggregateCounts(ordersInRange.map((order) => order.paymentStatus || 'unknown'))

  const recentOrders = ordersInRange.slice(0, 8)

  return (
    <IntegrationShell
      title="Sanity orders integration"
      description={`Order performance for the last ${rangeLabel}`}
      onBack={onBack}
    >
      <Stack space={5}>
        <Flex gap={3} style={{flexWrap: 'wrap'}}>
          <DetailStatCard
            label="Orders analysed"
            value={number(ordersInRange.length)}
            helper={`${rangeLabel} window`}
          />
          <DetailStatCard label="Gross sales" value={currency(summary.grossSales)} helper="Before refunds" />
          <DetailStatCard label="Net sales" value={currency(summary.netSales)} helper="After refunds" />
          <DetailStatCard
            label="Average order value"
            value={currency(summary.averageOrder)}
            helper="Across connected stores"
          />
        </Flex>

        <Flex gap={3} style={{flexWrap: 'wrap'}}>
          <StatusList title="Order status" items={statusBreakdown} />
          <StatusList title="Payment status" items={paymentBreakdown} />
        </Flex>

        <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)'}}>
          <Stack space={3}>
            <Heading size={2}>Recent orders</Heading>
            <Stack space={2}>
              {recentOrders.length === 0 ? (
                <Text size={1} muted>No orders captured in this range yet.</Text>
              ) : (
                recentOrders.map((order) => (
                  <Flex
                    key={order.id}
                    align="center"
                    justify="space-between"
                    gap={3}
                    style={{flexWrap: 'wrap'}}
                  >
                    <Stack space={1}>
                      <Text weight="semibold">Order {shortId(order.id)}</Text>
                      <Text size={1} muted>
                        {currency(order.total)} · {format(new Date(order.timestamp), 'MMM d, yyyy p')} ·{' '}
                        {formatDistanceToNow(new Date(order.timestamp), {addSuffix: true})}
                      </Text>
                      <Text size={1} muted>
                        Status: {toTitleCase(order.status)} · Payment: {toTitleCase(order.paymentStatus || 'unknown')}
                      </Text>
                    </Stack>
                    <Button
                      text="View order"
                      mode="ghost"
                      tone="primary"
                      onClick={() => router.navigateIntent('edit', {id: order.id, type: 'order'})}
                    />
                  </Flex>
                ))
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </IntegrationShell>
  )
}

function PayoutsIntegrationSection({payouts, onBack}: {payouts: PayoutSummary | null; onBack: () => void}) {
  if (!payouts) {
    return (
      <IntegrationShell
        title="Stripe payouts integration"
        description="Connect Stripe to track deposits, balances, and payout schedules."
        onBack={onBack}
      >
        <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)'}}>
          <Stack space={2}>
            <Text weight="semibold">No payout data available</Text>
              <Text size={1} muted>
                We couldn&rsquo;t load payout activity. Confirm your Stripe credentials or try again later.
              </Text>
          </Stack>
        </Card>
      </IntegrationShell>
    )
  }

  const recent = [...payouts.recent]
    .filter((entry) => Number.isFinite(entry.arrival))
    .sort((a, b) => b.arrival - a.arrival)
    .slice(0, 6)

  return (
    <IntegrationShell
      title="Stripe payouts integration"
      description="Balance and payout timing from your connected Stripe account."
      onBack={onBack}
    >
      <Stack space={5}>
        <Flex gap={3} style={{flexWrap: 'wrap'}}>
          <DetailStatCard label="Available balance" value={currency(payouts.available)} helper="Ready to pay out" />
          <DetailStatCard label="Pending balance" value={currency(payouts.pending)} helper="Awaiting settlement" />
          <DetailStatCard
            label="Next payout"
            value={payouts.nextArrival ? format(new Date(payouts.nextArrival), 'MMM d, yyyy') : '—'}
            helper={payouts.nextAmount ? currency(payouts.nextAmount) : 'Amount pending'}
          />
        </Flex>

        <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)'}}>
          <Stack space={3}>
            <Heading size={2}>Recent payouts</Heading>
            <Stack space={2}>
              {recent.length === 0 ? (
                <Text size={1} muted>No payouts recorded yet.</Text>
              ) : (
                recent.map((payout) => (
                  <Flex
                    key={payout.id}
                    align="center"
                    justify="space-between"
                    gap={3}
                    style={{flexWrap: 'wrap'}}
                  >
                    <Stack space={1}>
                      <Text weight="semibold">{currency(payout.amount)}</Text>
                      <Text size={1} muted>
                        {format(new Date(payout.arrival), 'MMM d, yyyy')} · {toTitleCase(payout.status)} · {payout.method}
                      </Text>
                    </Stack>
                    <Badge tone={payout.status === 'paid' ? 'positive' : payout.status === 'pending' ? 'default' : 'critical'}>
                      {toTitleCase(payout.status)}
                    </Badge>
                  </Flex>
                ))
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </IntegrationShell>
  )
}

function AnalyticsIntegrationSection({
  traffic,
  onBack,
  rangeLabel,
}: {
  traffic: TrafficSummary | null
  onBack: () => void
  rangeLabel: string
}) {
  if (!traffic) {
    return (
      <IntegrationShell
        title="Site analytics integration"
        description="Connect your analytics source to track traffic alongside revenue."
        onBack={onBack}
      >
        <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)'}}>
          <Stack space={2}>
            <Text weight="semibold">No analytics data available</Text>
              <Text size={1} muted>
                We couldn&rsquo;t load visitor data. Ensure your analytics integration is configured and try again.
              </Text>
          </Stack>
        </Card>
      </IntegrationShell>
    )
  }

  const labels = traffic.trendDates.map((date) => format(new Date(date), 'MMM d'))
  const trendPoints = traffic.trend
  const hasTrend = trendPoints.length > 1

  return (
    <IntegrationShell
      title="Site analytics integration"
      description={`Visitor activity for the last ${rangeLabel}`}
      onBack={onBack}
    >
      <Stack space={5}>
        <Flex gap={3} style={{flexWrap: 'wrap'}}>
          <DetailStatCard label="Visitors" value={number(traffic.visitors)} helper={`${rangeLabel} window`} />
          <DetailStatCard label="Sessions" value={number(traffic.sessions)} helper="Unique sessions" />
          <DetailStatCard label="Pageviews" value={number(traffic.pageviews)} helper="Total views" />
        </Flex>

        {hasTrend ? (
          <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)'}}>
            <Stack space={3}>
              <Heading size={2}>Session trend</Heading>
              <LineChart
                points={trendPoints}
                labels={labels}
                stroke="rgba(99, 102, 241, 0.9)"
                background="rgba(99, 102, 241, 0.18)"
                height={140}
              />
            </Stack>
          </Card>
        ) : null}

        <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)'}}>
          <Stack space={3}>
            <Heading size={2}>Recent daily metrics</Heading>
            <Stack space={2}>
              {traffic.recentDaily.length === 0 ? (
                <Text size={1} muted>No recent analytics samples available.</Text>
              ) : (
                traffic.recentDaily.map((day) => (
                  <Flex
                    key={day.date}
                    align="center"
                    justify="space-between"
                    gap={3}
                    style={{flexWrap: 'wrap'}}
                  >
                    <Text weight="semibold">{format(new Date(day.date), 'EEE, MMM d')}</Text>
                    <Flex gap={3} style={{flexWrap: 'wrap'}}>
                      <Badge tone="primary">{number(day.visitors)} visitors</Badge>
                      <Badge tone="default">{number(day.sessions)} sessions</Badge>
                      <Badge tone="default">{number(day.pageviews)} views</Badge>
                    </Flex>
                  </Flex>
                ))
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </IntegrationShell>
  )
}

function IntegrationShell({
  title,
  description,
  onBack,
  children,
}: {
  title: string
  description: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Flex
          align="center"
          justify="space-between"
          gap={3}
          style={{flexWrap: 'wrap'}}
        >
          <Stack space={1}>
            <Heading size={3}>{title}</Heading>
            <Text size={1} muted>{description}</Text>
          </Stack>
          <Button icon={ArrowLeftIcon} text="Back to dashboard" mode="ghost" onClick={onBack} />
        </Flex>
        {children}
      </Stack>
    </Card>
  )
}

function DetailStatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)', flex: '1 1 220px'}}>
      <Stack space={1}>
        <Text size={1} muted>{label}</Text>
        <Text weight="semibold">{value}</Text>
        {helper ? (
          <Text size={1} muted>
            {helper}
          </Text>
        ) : null}
      </Stack>
    </Card>
  )
}

function StatusList({
  title,
  items,
}: {
  title: string
  items: Array<{label: string; count: number}>
}) {
  return (
    <Card padding={4} radius={3} shadow={0} style={{background: 'var(--studio-surface-soft)', flex: '1 1 240px'}}>
      <Stack space={2}>
        <Heading size={2}>{title}</Heading>
        <Stack space={1}>
          {items.length === 0 ? (
            <Text size={1} muted>No data recorded.</Text>
          ) : (
            items.map((item) => (
              <Flex key={item.label} align="center" justify="space-between">
                <Text>{toTitleCase(item.label)}</Text>
                <Badge tone="default">{number(item.count)}</Badge>
              </Flex>
            ))
          )}
        </Stack>
      </Stack>
    </Card>
  )
}

function aggregateCounts(values: Array<string | null | undefined>) {
  const tally = new Map<string, number>()
  values.forEach((value) => {
    const key = (value || 'unknown').toLowerCase().trim() || 'unknown'
    tally.set(key, (tally.get(key) || 0) + 1)
  })
  return Array.from(tally.entries())
    .map(([label, count]) => ({label, count}))
    .sort((a, b) => b.count - a.count)
}

function shortId(id: string) {
  const clean = id.replace('drafts.', '')
  return clean.length <= 8 ? clean : clean.slice(-8).toUpperCase()
}

function toTitleCase(value: string) {
  return value
    .split(/\s|_|-/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function AccountsReceivableCard({summary}: {summary: Summary}) {
  const total = summary.outstanding
  const segments = [
    {label: 'Overdue', value: summary.overdue, color: '#ef4444'},
    {label: 'Due soon', value: summary.dueSoonTotal, color: '#f97316'},
    {label: 'Current', value: Math.max(0, summary.notDueTotal - summary.dueSoonTotal), color: '#22c55e'},
  ]

  return (
    <Card padding={[4, 5]} radius={4} shadow={1} style={{background: 'var(--studio-surface-strong)'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Heading size={2}>Accounts receivable</Heading>
          <Text size={1} muted>As of today</Text>
        </Flex>

        <Flex align="center" gap={4} style={{flexWrap: 'wrap'}}>
          <DonutChart size={140} thickness={28} segments={segments} total={total}>
            <Flex direction="column" align="center" gap={1}>
              <Text size={1} muted>Total AR</Text>
              <Text weight="semibold">{currency(total)}</Text>
            </Flex>
          </DonutChart>

          <Stack space={2} flex={1}>
            {segments.map((segment) => (
              <LegendRow
                key={segment.label}
                label={segment.label}
                value={currency(segment.value)}
                percent={total > 0 ? (segment.value / total) * 100 : 0}
                color={segment.color}
              />
            ))}
          </Stack>
        </Flex>
      </Stack>
    </Card>
  )
}

function ProgressStat({
  label,
  value,
  change,
  percent,
  tone,
}: {
  label: string
  value: string
  change: number | null
  percent: number
  tone: 'positive' | 'critical'
}) {
  const color = tone === 'positive' ? '#22c55e' : '#ef4444'
  const background = 'rgba(148, 163, 184, 0.2)'

  return (
    <Stack space={1}>
      <Flex justify="space-between" align="center">
        <Text size={1} muted>{label}</Text>
        <TrendBadge value={change} />
      </Flex>
      <Flex justify="space-between" align="center">
        <Text weight="semibold">{value}</Text>
        <Text size={1} muted>{percent.toFixed(1)}%</Text>
      </Flex>
      <Box style={{height: 8, background, borderRadius: 9999}}>
        <Box style={{width: `${Math.min(100, percent)}%`, height: '100%', background: color, borderRadius: 9999}} />
      </Box>
    </Stack>
  )
}

function LegendRow({label, value, percent, color}: {label: string; value: string; percent: number; color: string}) {
  return (
    <Flex align="center" justify="space-between" gap={3}>
      <Flex align="center" gap={2}>
        <Box style={{width: 10, height: 10, borderRadius: '50%', background: color}} />
        <Text size={1}>{label}</Text>
      </Flex>
      <Stack style={{textAlign: 'right'}} space={1}>
        <Text weight="semibold">{value}</Text>
        <Text size={1} muted>{percent.toFixed(1)}%</Text>
      </Stack>
    </Flex>
  )
}

function TrendBadge({value}: {value: number | null}) {
  if (value === null) {
    return (
      <Badge mode="outline" tone="default" radius={3}>
        —
      </Badge>
    )
  }
  const positive = value > 0
  const negative = value < 0
  const tone: 'default' | 'positive' | 'critical' = positive ? 'positive' : negative ? 'critical' : 'default'
  const symbol = positive ? '▲' : negative ? '▼' : '•'
  const magnitude = Math.abs(value).toFixed(1)
  return (
    <Badge tone={tone} radius={3}>
      {`${symbol} ${magnitude}%`}
    </Badge>
  )
}

function DonutChart({
  segments,
  size,
  thickness,
  total,
  children,
}: {
  segments: Array<{label: string; value: number; color: string}>
  size: number
  thickness: number
  total: number
  children?: React.ReactNode
}) {
  const datasetTotal = segments.reduce((sum, segment) => sum + segment.value, 0)
  const safeTotal = datasetTotal > 0 ? datasetTotal : 1
  let current = 0
  const gradient = segments
    .map((segment) => {
      const start = (current / safeTotal) * 360
      current += segment.value
      const end = (current / safeTotal) * 360
      return `${segment.color} ${start}deg ${Math.min(360, end)}deg`
    })
    .join(', ')
  const hasData = datasetTotal > 0

  return (
    <Box
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: hasData ? `conic-gradient(${gradient})` : '#e2e8f0',
      }}
    >
      <Box
        style={{
          position: 'absolute',
          inset: thickness,
          borderRadius: '50%',
          background: 'var(--studio-surface-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '8px',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

function LineChart({
  points,
  labels,
  stroke,
  background,
  height = 100,
}: {
  points: number[]
  labels?: string[]
  stroke: string
  background: string
  height?: number
}) {
  if (!points || points.length < 2) {
    return <Box style={{height, background: '#e2e8f0', borderRadius: 8}} />
  }
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const width = 280
  const step = points.length > 1 ? width / (points.length - 1) : width
  const coords = points
    .map((value, index) => {
      const x = Math.round(index * step)
      const y = Math.round(height - ((value - min) / range) * height)
      return `${x},${y}`
    })
    .join(' ')

  const area = `0,${height} ${coords} ${width},${height}`

  return (
    <Box style={{width: '100%'}}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill={background}
          stroke="none"
          points={area}
        />
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords}
        />
      </svg>
      {labels && labels.length > 0 ? (
        <Flex justify="space-between" marginTop={2}>
          <Text size={0} muted>
            {labels[0]}
          </Text>
          <Text size={0} muted>
            {labels[labels.length - 1]}
          </Text>
        </Flex>
      ) : null}
    </Box>
  )
}

function SnapshotMetric({label, value, tone}: {label: string; value: number; tone: 'positive' | 'critical'}) {
  const color = tone === 'positive' ? '#22c55e' : '#ef4444'
  return (
    <Card padding={3} radius={3} shadow={0} style={{background: 'rgba(15, 23, 42, 0.04)', flex: '1 1 120px'}}>
      <Stack space={1}>
        <Text size={1} muted>{label}</Text>
        <Text weight="semibold" style={{color}}>
          {currency(value)}
        </Text>
      </Stack>
    </Card>
  )
}

function FullWidthBar({children}: {children: React.ReactNode}) {
  return (
    <Box style={{height: 10, borderRadius: 9999, overflow: 'hidden', display: 'flex', width: '100%'}}>
      {children}
    </Box>
  )
}

function Segment({width, color, label}: {width: number; color: string; label: string}) {
  return <Box style={{width: `${Math.max(0, Math.min(width, 100))}%`, background: color}} aria-label={label} />
}

function normalize(raw: FetchResult): NormalizedData {
  const orders: NormalizedOrder[] = raw.orders
    .map((order) => {
      const timestamp = parseTimestamp(order.createdAt) ?? parseTimestamp(order._createdAt)
      if (!timestamp) return null
      return {
        id: order._id,
        timestamp,
        total: computeOrderTotal(order),
        status: (order.status || 'pending').toLowerCase(),
        paymentStatus: (order.paymentStatus || '').toLowerCase(),
      }
    })
    .filter(Boolean) as NormalizedOrder[]

  const invoices: NormalizedInvoice[] = raw.invoices
    .map((invoice) => {
      const timestamp = parseTimestamp(invoice.invoiceDate) ?? parseTimestamp(invoice._createdAt)
      if (!timestamp) return null
      const dueTimestamp = parseTimestamp(invoice.dueDate)
      return {
        id: invoice._id,
        timestamp,
        dueTimestamp,
        total: computeInvoiceTotal(invoice),
        status: (invoice.status || 'pending').toLowerCase(),
      }
    })
    .filter(Boolean) as NormalizedInvoice[]

  const expenses: NormalizedExpense[] = raw.expenses
    .map((expense) => {
      const timestamp = parseTimestamp(expense.date) ?? parseTimestamp(expense._createdAt)
      if (!timestamp) return null
      return {
        id: expense._id,
        timestamp,
        amount: Number(expense.amount) || 0,
        category: (expense.category || 'Uncategorized').trim() || 'Uncategorized',
      }
    })
    .filter(Boolean) as NormalizedExpense[]

  return {orders, invoices, expenses}
}

function summarize(data: NormalizedData, rangeDays: RangePreset): Summary {
  const now = Date.now()
  const rangeStart = now - rangeDays * DAY
  const previousStart = rangeStart - rangeDays * DAY

  const currentOrders = data.orders.filter((order) => order.timestamp >= rangeStart && order.timestamp <= now)
  const previousOrders = data.orders.filter((order) => order.timestamp >= previousStart && order.timestamp < rangeStart)

  const grossSales = currentOrders.reduce((sum, order) => (isCancelled(order.status) ? sum : sum + order.total), 0)
  const previousGrossSales = previousOrders.reduce((sum, order) => (isCancelled(order.status) ? sum : sum + order.total), 0)

  const refunds = currentOrders.reduce(
    (sum, order) => (order.paymentStatus.includes('refund') || isCancelled(order.status) ? sum + order.total : sum),
    0,
  )
  const previousRefunds = previousOrders.reduce(
    (sum, order) => (order.paymentStatus.includes('refund') || isCancelled(order.status) ? sum + order.total : sum),
    0,
  )

  const netSales = grossSales - refunds
  const previousNetSales = previousGrossSales - previousRefunds

  const orderCount = currentOrders.length
  const averageOrder = orderCount > 0 ? grossSales / orderCount : 0

  const currentExpenses = data.expenses.filter((expense) => expense.timestamp >= rangeStart && expense.timestamp <= now)
  const previousExpenses = data.expenses.filter((expense) => expense.timestamp >= previousStart && expense.timestamp < rangeStart)
  const expenseTotal = currentExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const previousExpenseTotal = previousExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  const netProfit = netSales - expenseTotal
  const previousNetProfit = previousNetSales - previousExpenseTotal

  const expenseCategories = aggregateCategories(currentExpenses)

  const currentInvoices = data.invoices.filter((invoice) => invoice.timestamp >= rangeStart && invoice.timestamp <= now)
  const outstandingInvoices = currentInvoices.filter((invoice) => !isClosedInvoice(invoice.status))
  const outstanding = outstandingInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
  const overdueInvoices = outstandingInvoices.filter((invoice) => invoice.dueTimestamp !== null && invoice.dueTimestamp < now)
  const overdue = overdueInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
  const dueSoonInvoices = outstandingInvoices.filter((invoice) => {
    if (!invoice.dueTimestamp) return false
    return invoice.dueTimestamp >= now && invoice.dueTimestamp <= now + 14 * DAY
  })
  const dueSoonTotal = dueSoonInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
  const notDueTotal = Math.max(0, outstanding - overdue)

  const thirtyStart = now - 30 * DAY
  const last30Invoices = data.invoices.filter((invoice) => invoice.timestamp >= thirtyStart && invoice.timestamp <= now)
  const paidLast30 = last30Invoices
    .filter((invoice) => isPaidInvoice(invoice.status))
    .reduce((sum, invoice) => sum + invoice.total, 0)
  const unpaidLast30 = last30Invoices
    .filter((invoice) => !isPaidInvoice(invoice.status))
    .reduce((sum, invoice) => sum + invoice.total, 0)

  const salesSeries = buildSalesSeries(currentOrders, Math.min(rangeDays, 30), now)
  const cashflowSeries = buildCashflowSeries(currentOrders, currentExpenses, now, CASHFLOW_MONTHS)

  return {
    rangeStart,
    rangeEnd: now,
    generatedAt: now,
    orderCount,
    grossSales,
    previousGrossSales,
    grossChangePct: computeChangePct(previousGrossSales, grossSales),
    netSales,
    previousNetSales,
    netChangePct: computeChangePct(previousNetSales, netSales),
    refunds,
    averageOrder,
    expenseTotal,
    previousExpenseTotal,
    expenseChangePct: computeChangePct(previousExpenseTotal, expenseTotal),
    netProfit,
    previousNetProfit,
    netProfitChangePct: computeChangePct(previousNetProfit, netProfit),
    expenseCategories,
    outstanding,
    overdue,
    overdueCount: overdueInvoices.length,
    dueSoonCount: dueSoonInvoices.length,
    dueSoonTotal,
    notDueTotal,
    paidLast30,
    unpaidLast30,
    invoiceCountLast30: last30Invoices.length,
    salesSeries,
    cashflowSeries,
  }
}

function buildSalesSeries(orders: NormalizedOrder[], days: number, now: number): SalesPoint[] {
  const points: SalesPoint[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = now - i * DAY
    const dayEnd = dayStart + DAY
    const total = orders
      .filter((order) => order.timestamp >= dayStart && order.timestamp < dayEnd && !isCancelled(order.status))
      .reduce((sum, order) => sum + order.total, 0)
    points.push({date: dayStart, total})
  }
  return points
}

function buildCashflowSeries(
  orders: NormalizedOrder[],
  expenses: NormalizedExpense[],
  now: number,
  months: number,
): CashflowPoint[] {
  const result: CashflowPoint[] = []
  const endDate = new Date(now)
  const base = new Date(endDate.getFullYear(), endDate.getMonth(), 1).getTime()

  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(base)
    start.setMonth(start.getMonth() - i)
    const end = new Date(start)
    end.setMonth(end.getMonth() + 1)

    const startMs = start.getTime()
    const endMs = end.getTime()

    const income = orders
      .filter((order) => order.timestamp >= startMs && order.timestamp < endMs && !isCancelled(order.status))
      .reduce((sum, order) => sum + order.total, 0)

    const expense = expenses
      .filter((entry) => entry.timestamp >= startMs && entry.timestamp < endMs)
      .reduce((sum, entry) => sum + entry.amount, 0)

    result.push({label: format(start, 'MMM'), income, expense, net: income - expense})
  }

  return result
}

function aggregateCategories(expenses: NormalizedExpense[]): CategoryBreakdown[] {
  const grouped = new Map<string, number>()
  expenses.forEach((expense) => {
    grouped.set(expense.category, (grouped.get(expense.category) || 0) + expense.amount)
  })
  return Array.from(grouped.entries())
    .map(([category, total]) => ({category, total}))
    .sort((a, b) => b.total - a.total)
}

function buildCategorySegments(categories: CategoryBreakdown[]) {
  const palette = ['#6366f1', '#22c55e', '#f59e0b', '#0ea5e9', '#ec4899', '#14b8a6']
  if (categories.length === 0) {
    return [
      {
        category: 'No expenses',
        total: 0,
        color: '#cbd5f5',
      },
    ]
  }
  const top = categories.slice(0, 5)
  const other = categories.slice(5).reduce((sum, entry) => sum + entry.total, 0)
  const mapped = top.map((entry, index) => ({...entry, color: palette[index % palette.length]}))
  if (other > 0) {
    mapped.push({category: 'Other', total: other, color: '#94a3b8'})
  }
  return mapped
}

function summarizeTraffic(raw: TrafficResponse): TrafficSummary {
  const recent = Array.isArray(raw.daily) ? raw.daily.slice(-30) : []
  const trendPairs = recent
    .map((point) => ({
      date: Date.parse(point.date),
      sessions: Number(point.sessions) || 0,
    }))
    .filter((entry) => Number.isFinite(entry.date))

  const dailyWindow = recent.slice(-14).map((point) => ({
    date: Date.parse(point.date),
    visitors: Number(point.visitors) || 0,
    pageviews: Number(point.pageviews) || 0,
    sessions: Number(point.sessions) || 0,
  }))

  const validDaily = dailyWindow.filter((entry) => Number.isFinite(entry.date))

  return {
    visitors: raw.totals?.visitors || 0,
    pageviews: raw.totals?.pageviews || 0,
    sessions: raw.totals?.sessions || 0,
    trend: trendPairs.map((entry) => entry.sessions),
    trendDates: trendPairs.map((entry) => entry.date),
    recentDaily: validDaily,
  }
}

function summarizePayout(raw: PayoutResponse): PayoutSummary {
  return {
    currency: (raw.currency || 'usd').toLowerCase(),
    nextArrival: raw.nextArrival ? Date.parse(raw.nextArrival) : undefined,
    nextAmount: raw.nextAmount,
    pending: Number(raw.pendingBalance) || 0,
    available: Number(raw.availableBalance) || 0,
    recent:
      raw.recentPayouts?.map((payout) => ({
        id: payout.id,
        arrival: Date.parse(payout.arrivalDate),
        amount: payout.amount,
        status: payout.status,
        method: payout.method,
      })) || [],
  }
}

function isCancelled(status: string): boolean {
  const normalized = status.toLowerCase()
  return normalized === 'cancelled' || normalized === 'canceled' || normalized === 'expired'
}

function isClosedInvoice(status: string): boolean {
  const normalized = status.toLowerCase()
  return ['paid', 'refunded', 'cancelled', 'canceled', 'expired'].includes(normalized)
}

function isPaidInvoice(status: string): boolean {
  const normalized = status.toLowerCase()
  return normalized.includes('paid') || normalized.includes('deposit') || normalized.includes('complete')
}

function computeOrderTotal(order: RawOrder): number {
  const direct = Number(order.totalAmount)
  const subtotal = Number(order.amountSubtotal) || 0
  const tax = Number(order.amountTax) || 0
  const shipping = Number(order.amountShipping) || 0
  let total = direct || subtotal + tax + shipping
  if (total >= 100000) total = total / 100
  return Number.isFinite(total) ? total : 0
}

function computeInvoiceTotal(invoice: RawInvoice): number {
  const direct = Number(invoice.total)
  const amount = Number(invoice.amount)
  const subtotal = Number(invoice.amountSubtotal) || 0
  const tax = Number(invoice.amountTax) || 0
  let total = direct || amount || subtotal + tax
  if (total >= 100000) total = total / 100
  return Number.isFinite(total) ? total : 0
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function computeChangePct(previous: number, current: number): number | null {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

function currency(value: number, currencyCode = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function number(value: number) {
  return new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(value || 0)
}
