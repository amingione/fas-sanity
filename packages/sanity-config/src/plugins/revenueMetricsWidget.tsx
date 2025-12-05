import {Card, Stack, Box, Text, Flex, Badge, Select, Grid, Button} from '@sanity/ui'
import {useEffect, useState} from 'react'
import {useClient} from 'sanity'

interface RevenueData {
  today: number
  yesterday: number
  thisWeek: number
  lastWeek: number
  thisMonth: number
  lastMonth: number
  orderCount: {
    today: number
    thisWeek: number
    thisMonth: number
  }
  averageOrderValue: number
  topProducts: Array<{
    title: string
    revenue: number
    count: number
    profit: number
    margin: number
  }>
  revenueByType: {
    online: number
    wholesale: number
    inStore: number
  }
  profitMetrics: {
    totalRevenue: number
    totalCost: number
    grossProfit: number
    profitMargin: number
  }
  refunds: {
    count: number
    amount: number
    percentage: number
  }
  paymentMethods: Array<{
    method: string
    amount: number
    count: number
    percentage: number
  }>
}

type BadgeTone = 'default' | 'primary' | 'positive' | 'caution' | 'critical'

export function RevenueMetricsWidget() {
  const client = useClient({apiVersion: '2024-01-01'})
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month'>('today')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fetchRevenueData = async () => {
    const now = new Date()

    // Date calculations
    const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString()
    const todayEnd = new Date(now.setHours(23, 59, 59, 999)).toISOString()

    const yesterdayStart = new Date(now.setDate(now.getDate() - 1))
    yesterdayStart.setHours(0, 0, 0, 0)
    const yesterdayEnd = new Date(yesterdayStart)
    yesterdayEnd.setHours(23, 59, 59, 999)

    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(weekStart.getDate() - 7)
    const lastWeekEnd = new Date(weekStart)
    lastWeekEnd.setMilliseconds(-1)

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    // Fetch all orders with detailed line items including cost data
    const query = `{
      "todayOrders": *[_type == "order" && _createdAt >= "${todayStart}" && _createdAt <= "${todayEnd}"] {
        orderType,
        status,
        paymentMethod,
        lineItems[] {
          quantity,
          unitPrice,
          product->{
            title,
            manufacturingCost
          }
        }
      },
      "yesterdayOrders": *[_type == "order" && _createdAt >= "${yesterdayStart.toISOString()}" && _createdAt <= "${yesterdayEnd.toISOString()}"] {
        lineItems[] {
          quantity,
          unitPrice,
          product->{manufacturingCost}
        }
      },
      "weekOrders": *[_type == "order" && _createdAt >= "${weekStart.toISOString()}"] {
        orderType,
        status,
        paymentMethod,
        lineItems[] {
          quantity,
          unitPrice,
          product->{
            title,
            manufacturingCost
          }
        }
      },
      "lastWeekOrders": *[_type == "order" && _createdAt >= "${lastWeekStart.toISOString()}" && _createdAt <= "${lastWeekEnd.toISOString()}"] {
        lineItems[] {
          quantity,
          unitPrice,
          product->{manufacturingCost}
        }
      },
      "monthOrders": *[_type == "order" && _createdAt >= "${monthStart.toISOString()}"] {
        orderType,
        status,
        paymentMethod,
        lineItems[] {
          quantity,
          unitPrice,
          product->{
            title,
            manufacturingCost
          }
        }
      },
      "lastMonthOrders": *[_type == "order" && _createdAt >= "${lastMonthStart.toISOString()}" && _createdAt <= "${lastMonthEnd.toISOString()}"] {
        lineItems[] {
          quantity,
          unitPrice,
          product->{manufacturingCost}
        }
      }
    }`

    const result = await client.fetch(query)

    // Calculate revenue and cost from line items
    const calculateMetrics = (orders: any[]) => {
      let revenue = 0
      let cost = 0

      orders.forEach((order) => {
        ;(order.lineItems || []).forEach((item: any) => {
          const itemRevenue = (item.quantity || 0) * (item.unitPrice || 0)
          const itemCost = (item.quantity || 0) * (item.product?.manufacturingCost || 0)
          revenue += itemRevenue
          cost += itemCost
        })
      })

      return {revenue, cost}
    }

    // Calculate revenue by order type
    const calculateRevenueByType = (orders: any[]) => {
      const byType = {online: 0, wholesale: 0, inStore: 0}
      orders.forEach((order) => {
        const orderTotal = (order.lineItems || []).reduce((sum: number, item: any) => {
          return sum + (item.quantity || 0) * (item.unitPrice || 0)
        }, 0)
        const type = order.orderType || 'online'
        if (type === 'wholesale') byType.wholesale += orderTotal
        else if (type === 'in-store') byType.inStore += orderTotal
        else byType.online += orderTotal
      })
      return byType
    }

    // Calculate refunds
    const calculateRefunds = (orders: any[]) => {
      const refundedOrders = orders.filter(
        (o) => o.status === 'refunded' || o.status === 'cancelled' || o.status === 'returned',
      )
      const refundAmount = refundedOrders.reduce((sum, order) => {
        return (
          sum +
          (order.lineItems || []).reduce((total: number, item: any) => {
            return total + (item.quantity || 0) * (item.unitPrice || 0)
          }, 0)
        )
      }, 0)

      const totalRevenue = orders.reduce((sum, order) => {
        return (
          sum +
          (order.lineItems || []).reduce((total: number, item: any) => {
            return total + (item.quantity || 0) * (item.unitPrice || 0)
          }, 0)
        )
      }, 0)

      return {
        count: refundedOrders.length,
        amount: refundAmount,
        percentage: totalRevenue > 0 ? (refundAmount / totalRevenue) * 100 : 0,
      }
    }

    // Calculate payment method breakdown
    const calculatePaymentMethods = (orders: any[]) => {
      const methodMap = new Map<string, {amount: number; count: number}>()

      orders.forEach((order) => {
        // Skip refunded orders
        if (order.status === 'refunded' || order.status === 'cancelled') return

        const method = order.paymentMethod || 'Unknown'
        const orderTotal = (order.lineItems || []).reduce((sum: number, item: any) => {
          return sum + (item.quantity || 0) * (item.unitPrice || 0)
        }, 0)

        if (methodMap.has(method)) {
          const existing = methodMap.get(method)!
          methodMap.set(method, {
            amount: existing.amount + orderTotal,
            count: existing.count + 1,
          })
        } else {
          methodMap.set(method, {amount: orderTotal, count: 1})
        }
      })

      const totalAmount = Array.from(methodMap.values()).reduce((sum, m) => sum + m.amount, 0)

      return Array.from(methodMap.entries())
        .map(([method, data]) => ({
          method,
          amount: data.amount,
          count: data.count,
          percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
    }

    // Calculate top products with profit margins
    const calculateTopProducts = (orders: any[]) => {
      const productMap = new Map<string, {revenue: number; cost: number; count: number}>()

      orders.forEach((order) => {
        ;(order.lineItems || []).forEach((item: any) => {
          const title = item.product?.title || 'Unknown Product'
          const revenue = (item.quantity || 0) * (item.unitPrice || 0)
          const cost = (item.quantity || 0) * (item.product?.manufacturingCost || 0)

          if (productMap.has(title)) {
            const existing = productMap.get(title)!
            productMap.set(title, {
              revenue: existing.revenue + revenue,
              cost: existing.cost + cost,
              count: existing.count + (item.quantity || 0),
            })
          } else {
            productMap.set(title, {revenue, cost, count: item.quantity || 0})
          }
        })
      })

      return Array.from(productMap.entries())
        .map(([title, data]) => ({
          title,
          revenue: data.revenue,
          count: data.count,
          profit: data.revenue - data.cost,
          margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
    }

    const todayMetrics = calculateMetrics(result.todayOrders)
    const yesterdayMetrics = calculateMetrics(result.yesterdayOrders)
    const weekMetrics = calculateMetrics(result.weekOrders)
    const lastWeekMetrics = calculateMetrics(result.lastWeekOrders)
    const monthMetrics = calculateMetrics(result.monthOrders)
    const lastMonthMetrics = calculateMetrics(result.lastMonthOrders)

    setData({
      today: todayMetrics.revenue,
      yesterday: yesterdayMetrics.revenue,
      thisWeek: weekMetrics.revenue,
      lastWeek: lastWeekMetrics.revenue,
      thisMonth: monthMetrics.revenue,
      lastMonth: lastMonthMetrics.revenue,
      orderCount: {
        today: result.todayOrders.length,
        thisWeek: result.weekOrders.length,
        thisMonth: result.monthOrders.length,
      },
      averageOrderValue:
        result.monthOrders.length > 0 ? monthMetrics.revenue / result.monthOrders.length : 0,
      topProducts: calculateTopProducts(result.monthOrders),
      revenueByType: calculateRevenueByType(result.monthOrders),
      profitMetrics: {
        totalRevenue: monthMetrics.revenue,
        totalCost: monthMetrics.cost,
        grossProfit: monthMetrics.revenue - monthMetrics.cost,
        profitMargin:
          monthMetrics.revenue > 0
            ? ((monthMetrics.revenue - monthMetrics.cost) / monthMetrics.revenue) * 100
            : 0,
      },
      refunds: calculateRefunds(result.monthOrders),
      paymentMethods: calculatePaymentMethods(result.monthOrders),
    })
    setLoading(false)
  }

  useEffect(() => {
    fetchRevenueData()
    // Refresh every 5 minutes
    const interval = setInterval(fetchRevenueData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [client])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
  }

  const getChangeTone = (change: number): BadgeTone => {
    if (change > 0) return 'positive'
    if (change < 0) return 'critical'
    return 'default'
  }

  const getMarginTone = (margin: number): BadgeTone => {
    if (margin >= 40) return 'positive'
    if (margin >= 20) return 'primary'
    if (margin >= 10) return 'caution'
    return 'critical'
  }

  if (loading) {
    return (
      <Card padding={4}>
        <Text>Loading revenue data...</Text>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card padding={4}>
        <Text>No revenue data available</Text>
      </Card>
    )
  }

  const currentRevenue =
    timeframe === 'today' ? data.today : timeframe === 'week' ? data.thisWeek : data.thisMonth
  const previousRevenue =
    timeframe === 'today' ? data.yesterday : timeframe === 'week' ? data.lastWeek : data.lastMonth
  const change = calculateChange(currentRevenue, previousRevenue)
  const orderCount =
    timeframe === 'today'
      ? data.orderCount.today
      : timeframe === 'week'
        ? data.orderCount.thisWeek
        : data.orderCount.thisMonth

  return (
    <Card padding={3}>
      <Stack space={4}>
        {/* Header */}
        <Flex justify="space-between" align="center">
          <Text size={2} weight="semibold">
            Revenue Metrics
          </Text>
          <Flex gap={2}>
            <Button
              fontSize={1}
              padding={2}
              text={showAdvanced ? 'Basic' : 'Advanced'}
              mode="ghost"
              tone="primary"
              onClick={() => setShowAdvanced(!showAdvanced)}
            />
            <Select
              fontSize={1}
              value={timeframe}
              onChange={(e) => setTimeframe(e.currentTarget.value as any)}
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </Select>
          </Flex>
        </Flex>

        {/* Main Revenue Card */}
        <Card padding={4} radius={2} shadow={1} tone="primary">
          <Stack space={2}>
            <Text size={1} muted>
              {timeframe === 'today'
                ? "Today's Revenue"
                : timeframe === 'week'
                  ? "This Week's Revenue"
                  : "This Month's Revenue"}
            </Text>
            <Text size={5} weight="bold">
              {formatCurrency(currentRevenue)}
            </Text>
            <Flex gap={2} align="center">
              <Badge tone={getChangeTone(change)} fontSize={1}>
                {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toFixed(1)}%
              </Badge>
              <Text size={1} muted>
                vs{' '}
                {timeframe === 'today'
                  ? 'yesterday'
                  : timeframe === 'week'
                    ? 'last week'
                    : 'last month'}{' '}
                ({formatCurrency(previousRevenue)})
              </Text>
            </Flex>
          </Stack>
        </Card>

        {/* Key Metrics Grid */}
        <Grid columns={showAdvanced ? 4 : 2} gap={3}>
          <Card padding={3} radius={2} shadow={1}>
            <Stack space={2}>
              <Text size={1} muted>
                Orders
              </Text>
              <Text size={3} weight="bold">
                {orderCount}
              </Text>
            </Stack>
          </Card>
          <Card padding={3} radius={2} shadow={1}>
            <Stack space={2}>
              <Text size={1} muted>
                Avg Order Value
              </Text>
              <Text size={3} weight="bold">
                {formatCurrency(data.averageOrderValue)}
              </Text>
            </Stack>
          </Card>
          {showAdvanced && (
            <>
              <Card padding={3} radius={2} shadow={1}>
                <Stack space={2}>
                  <Text size={1} muted>
                    Gross Profit
                  </Text>
                  <Text size={3} weight="bold">
                    {formatCurrency(data.profitMetrics.grossProfit)}
                  </Text>
                </Stack>
              </Card>
              <Card padding={3} radius={2} shadow={1}>
                <Stack space={2}>
                  <Flex align="center" gap={1}>
                    <Text size={1} muted>
                      Profit Margin
                    </Text>
                    <Badge tone={getMarginTone(data.profitMetrics.profitMargin)} fontSize={0}>
                      {data.profitMetrics.profitMargin >= 40
                        ? 'Excellent'
                        : data.profitMetrics.profitMargin >= 20
                          ? 'Good'
                          : data.profitMetrics.profitMargin >= 10
                            ? 'Fair'
                            : 'Low'}
                    </Badge>
                  </Flex>
                  <Text size={3} weight="bold">
                    {data.profitMetrics.profitMargin.toFixed(1)}%
                  </Text>
                </Stack>
              </Card>
            </>
          )}
        </Grid>

        {showAdvanced && (
          <>
            {/* Profit Breakdown */}
            <Card padding={3} radius={2} shadow={1} tone="transparent">
              <Stack space={3}>
                <Text size={1} weight="semibold">
                  Profit Analysis (This Month)
                </Text>
                <Grid columns={3} gap={2}>
                  <Box>
                    <Text size={0} muted>
                      Revenue
                    </Text>
                    <Text size={2} weight="semibold">
                      {formatCurrency(data.profitMetrics.totalRevenue)}
                    </Text>
                  </Box>
                  <Box>
                    <Text size={0} muted>
                      Cost
                    </Text>
                    <Text size={2} weight="semibold">
                      {formatCurrency(data.profitMetrics.totalCost)}
                    </Text>
                  </Box>
                  <Box>
                    <Text size={0} muted>
                      Profit
                    </Text>
                    <Text size={2} weight="semibold" style={{color: '#43a047'}}>
                      {formatCurrency(data.profitMetrics.grossProfit)}
                    </Text>
                  </Box>
                </Grid>
              </Stack>
            </Card>

            {/* Refunds */}
            {data.refunds.count > 0 && (
              <Card padding={3} radius={2} shadow={1} tone="critical">
                <Flex justify="space-between" align="center">
                  <Box>
                    <Text size={1} weight="semibold">
                      Refunds & Cancellations
                    </Text>
                    <Text size={0} muted>
                      {data.refunds.count} orders
                    </Text>
                  </Box>
                  <Box style={{textAlign: 'right'}}>
                    <Text size={2} weight="bold">
                      {formatCurrency(data.refunds.amount)}
                    </Text>
                    <Text size={0} muted>
                      {data.refunds.percentage.toFixed(1)}% of revenue
                    </Text>
                  </Box>
                </Flex>
              </Card>
            )}

            {/* Payment Methods */}
            <Stack space={2}>
              <Text size={1} weight="semibold">
                Payment Methods (This Month)
              </Text>
              <Stack space={2}>
                {data.paymentMethods.map((method) => (
                  <Card key={method.method} padding={2} radius={2} shadow={1}>
                    <Flex justify="space-between" align="center">
                      <Box flex={1}>
                        <Text size={1} weight="semibold">
                          {method.method}
                        </Text>
                        <Text size={0} muted>
                          {method.count} transactions
                        </Text>
                      </Box>
                      <Box style={{textAlign: 'right'}}>
                        <Text size={1} weight="semibold">
                          {formatCurrency(method.amount)}
                        </Text>
                        <Text size={0} muted>
                          {method.percentage.toFixed(1)}%
                        </Text>
                      </Box>
                    </Flex>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </>
        )}

        {/* Revenue by Type */}
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Revenue by Type (This Month)
          </Text>
          <Stack space={2}>
            <Card padding={2} radius={2} tone="default">
              <Flex justify="space-between" align="center">
                <Flex gap={2} align="center">
                  <Badge tone="primary">Online</Badge>
                  <Text size={1}>{formatCurrency(data.revenueByType.online)}</Text>
                </Flex>
                <Text size={1} muted>
                  {((data.revenueByType.online / data.thisMonth) * 100).toFixed(0)}%
                </Text>
              </Flex>
            </Card>
            <Card padding={2} radius={2} tone="default">
              <Flex justify="space-between" align="center">
                <Flex gap={2} align="center">
                  <Badge tone="positive">Wholesale</Badge>
                  <Text size={1}>{formatCurrency(data.revenueByType.wholesale)}</Text>
                </Flex>
                <Text size={1} muted>
                  {((data.revenueByType.wholesale / data.thisMonth) * 100).toFixed(0)}%
                </Text>
              </Flex>
            </Card>
            <Card padding={2} radius={2} tone="default">
              <Flex justify="space-between" align="center">
                <Flex gap={2} align="center">
                  <Badge tone="caution">In-Store</Badge>
                  <Text size={1}>{formatCurrency(data.revenueByType.inStore)}</Text>
                </Flex>
                <Text size={1} muted>
                  {((data.revenueByType.inStore / data.thisMonth) * 100).toFixed(0)}%
                </Text>
              </Flex>
            </Card>
          </Stack>
        </Stack>

        {/* Top Products */}
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Top Products (This Month) {showAdvanced && '- with Margins'}
          </Text>
          <Stack space={2}>
            {data.topProducts.map((product, index) => (
              <Card key={product.title} padding={2} radius={2} shadow={1}>
                <Flex justify="space-between" align="center">
                  <Box flex={1}>
                    <Flex gap={2} align="center">
                      <Badge tone="primary" fontSize={0}>
                        #{index + 1}
                      </Badge>
                      <Text
                        size={1}
                        weight="semibold"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {product.title}
                      </Text>
                    </Flex>
                    <Flex gap={2} align="center">
                      <Text size={0} muted>
                        {product.count} sold
                      </Text>
                      {showAdvanced && (
                        <>
                          <Text size={0} muted>
                            •
                          </Text>
                          <Badge tone={getMarginTone(product.margin)} fontSize={0}>
                            {product.margin.toFixed(0)}% margin
                          </Badge>
                        </>
                      )}
                    </Flex>
                  </Box>
                  <Box style={{textAlign: 'right'}}>
                    <Text size={1} weight="semibold">
                      {formatCurrency(product.revenue)}
                    </Text>
                    {showAdvanced && (
                      <Text size={0} muted style={{color: '#43a047'}}>
                        +{formatCurrency(product.profit)} profit
                      </Text>
                    )}
                  </Box>
                </Flex>
              </Card>
            ))}
            {data.topProducts.length === 0 && (
              <Text size={1} muted align="center">
                No product data available
              </Text>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Card>
  )
}
