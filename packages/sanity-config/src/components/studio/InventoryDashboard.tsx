import {forwardRef, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {Box, Card, Flex, Grid, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {INVENTORY_DOCUMENT_TYPE} from '../../../../../shared/docTypes'

const API_VERSION = '2024-10-01'

type StockOverview = {
  inStock: number
  lowStock: number
  outOfStock: number
  overstocked: number
}

type InventoryRow = {
  product?: {title?: string; sku?: string} | null
  quantityAvailable?: number
  reorderPoint?: number
  reorderQuantity?: number
  quantityInProduction?: number
}

type ManufacturingStats = {
  urgent: number
  inProduction: number
  completedToday: number
}

type InventoryValueStats = {
  totalValue?: number
  avgCost?: number
  avgTurnover?: number
}

type ValueByCategoryRow = {category?: string; value?: number}

type DashboardQueryResult = {
  stockOverview: StockOverview
  lowStock: InventoryRow[]
  manufacturingQueue: ManufacturingStats
  inventoryValue: InventoryValueStats
  valueByCategory: ValueByCategoryRow[]
}

const DASHBOARD_QUERY = `{
  "stockOverview": {
    "inStock": count(*[_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable > reorderPoint]),
    "lowStock": count(*[_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable <= reorderPoint && quantityAvailable > 0]),
    "outOfStock": count(*[_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable <= 0]),
    "overstocked": count(*[_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityOnHand > reorderPoint * 3])
  },
  "lowStock": *[_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable <= reorderPoint] | order(quantityAvailable asc){
    product->{title, sku},
    quantityAvailable,
    reorderPoint,
    reorderQuantity,
    quantityInProduction
  },
  "manufacturingQueue": {
    "urgent": count(*[_type == "manufacturingOrder" && priority == "urgent" && status != "completed"]),
    "inProduction": count(*[_type == "manufacturingOrder" && status == "in_production"]),
    "completedToday": count(*[_type == "manufacturingOrder" && status == "completed" && actualCompletion >= $today])
  },
  "inventoryValue": {
    "totalValue": math::sum(*[_type == "${INVENTORY_DOCUMENT_TYPE}"].totalValue),
    "avgCost": math::avg(*[_type == "${INVENTORY_DOCUMENT_TYPE}"].unitCost),
    "avgTurnover": math::avg(*[_type == "${INVENTORY_DOCUMENT_TYPE}"].turnoverRate)
  },
  "valueByCategory": *[_type == "${INVENTORY_DOCUMENT_TYPE}"]{
    "category": coalesce(product->category->title, "Uncategorized"),
    "value": coalesce(totalValue, quantityOnHand * unitCost, 0)
  }
}`

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1})

function startOfToday(): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

const StatCard = ({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'neutral' | 'critical' | 'caution' | 'positive' | 'transparent'
}) => (
  <Card padding={4} radius={3} shadow={1} tone={tone}>
    <Stack space={2}>
      <Text size={1} muted>
        {label}
      </Text>
      <Heading size={3}>{value}</Heading>
    </Stack>
  </Card>
)

const InventoryDashboard = forwardRef<HTMLDivElement>(function InventoryDashboard(_props, ref) {
  const client = useClient({apiVersion: API_VERSION})
  const [data, setData] = useState<DashboardQueryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    client
      .fetch<DashboardQueryResult>(DASHBOARD_QUERY, {today: startOfToday()})
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('InventoryDashboard query failed', err)
        setError(err?.message || 'Unable to load inventory data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client])

  const categoryBreakdown = useMemo(() => {
    if (!data?.valueByCategory?.length) return []
    const map = new Map<string, number>()
    for (const row of data.valueByCategory) {
      const key = (row?.category || 'Uncategorized').trim() || 'Uncategorized'
      const value = toPositive(row?.value || 0)
      map.set(key, (map.get(key) || 0) + value)
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({label, value}))
      .sort((a, b) => b.value - a.value)
  }, [data?.valueByCategory])

  if (loading) {
    return (
      <Box ref={ref}>
        <Flex align="center" justify="center" padding={6}>
          <Spinner />
        </Flex>
      </Box>
    )
  }

  if (error) {
    return (
      <Box ref={ref}>
        <Card padding={5} tone="critical" radius={3}>
          <Stack space={3}>
            <Heading size={2}>Inventory Dashboard</Heading>
            <Text>{error}</Text>
          </Stack>
        </Card>
      </Box>
    )
  }

  if (!data) return <Box ref={ref} />

  const {stockOverview, lowStock, manufacturingQueue, inventoryValue} = data

  return (
    <Box ref={ref}>
      <Stack space={4} padding={4}>
        <Heading size={3}>Inventory Dashboard</Heading>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold">Stock Overview</Text>
            <Grid columns={[1, 2, 4]} gap={3}>
              <StatCard label="In Stock" value={String(stockOverview?.inStock ?? 0)} tone="default" />
              <StatCard
                label="Low Stock"
                value={String(stockOverview?.lowStock ?? 0)}
                tone="caution"
              />
              <StatCard
                label="Out of Stock"
                value={String(stockOverview?.outOfStock ?? 0)}
                tone="critical"
              />
              <StatCard
                label="Overstocked"
                value={String(stockOverview?.overstocked ?? 0)}
                tone="neutral"
              />
            </Grid>
          </Stack>
        </Card>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold">Low Stock Alerts</Text>
            {lowStock?.length ? (
              <Stack space={2}>
                {lowStock.slice(0, 10).map((item, index) => (
                  <Card key={`${item.product?.title || index}-${item.product?.sku || index}`} padding={3} radius={2} border>
                    <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
                      <Stack space={1}>
                        <Text weight="semibold">{item.product?.title || 'Product'}</Text>
                        {item.product?.sku && (
                          <Text size={1} muted>
                            SKU: {item.product.sku}
                          </Text>
                        )}
                      </Stack>
                      <Flex gap={4} align="center">
                        <Text size={1}>
                          Available:{' '}
                          <strong>{Number(item.quantityAvailable ?? 0).toFixed(0)}</strong>
                        </Text>
                        <Text size={1}>
                          Reorder:{' '}
                          <strong>{Number(item.reorderPoint ?? 0).toFixed(0)}</strong>
                        </Text>
                        <Text size={1}>
                          In Production:{' '}
                          <strong>{Number(item.quantityInProduction ?? 0).toFixed(0)}</strong>
                        </Text>
                      </Flex>
                    </Flex>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Text size={1} muted>
                No products below their reorder point.
              </Text>
            )}
          </Stack>
        </Card>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold">Manufacturing Queue</Text>
            <Grid columns={[1, 3]} gap={3}>
              <StatCard label="Urgent" value={String(manufacturingQueue?.urgent ?? 0)} tone="critical" />
              <StatCard
                label="In Production"
                value={String(manufacturingQueue?.inProduction ?? 0)}
                tone="default"
              />
              <StatCard
                label="Completed Today"
                value={String(manufacturingQueue?.completedToday ?? 0)}
                tone="positive"
              />
            </Grid>
          </Stack>
        </Card>

        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold">Inventory Value & Turnover</Text>
            <Grid columns={[1, 2]} gap={4}>
              <Stack space={2}>
                <Text size={1} muted>
                  Total On-Hand Value
                </Text>
                <Heading size={2}>
                  {currencyFormatter.format(Math.max(0, inventoryValue?.totalValue || 0))}
                </Heading>
                <Text size={1} muted>
                  Avg Unit Cost: {currencyFormatter.format(Math.max(0, inventoryValue?.avgCost || 0))}
                </Text>
                <Text size={1} muted>
                  Avg Turnover (yr): {numberFormatter.format(Math.max(0, inventoryValue?.avgTurnover || 0))}
                </Text>
              </Stack>
              <Stack space={2}>
                <Text size={1} muted>
                  Value by Category
                </Text>
                {categoryBreakdown.length ? (
                  <Stack space={1}>
                    {categoryBreakdown.slice(0, 6).map((entry) => (
                      <Flex key={entry.label} justify="space-between">
                        <Text size={1}>{entry.label}</Text>
                        <Text size={1} weight="semibold">
                          {currencyFormatter.format(entry.value)}
                        </Text>
                      </Flex>
                    ))}
                  </Stack>
                ) : (
                  <Text size={1} muted>
                    Not enough data yet.
                  </Text>
                )}
              </Stack>
            </Grid>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
})

InventoryDashboard.displayName = 'InventoryDashboard'

function toPositive(value: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

export default InventoryDashboard
