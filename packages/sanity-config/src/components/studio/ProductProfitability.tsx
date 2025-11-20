import {useCallback, useEffect, useMemo, useState} from 'react'
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
  TextInput,
} from '@sanity/ui'
import {DownloadIcon, RefreshIcon, SearchIcon} from '@sanity/icons'
import {exportRevenueReportCsv, type RevenueExportRow} from '../../utils/financeExports'

const API_VERSION = '2024-10-01'

type ProfitabilityRow = {
  _id: string
  title?: string
  price?: number
  sku?: string
  unitsSold?: number
  revenue?: number
  cogs?: number
}

const PRODUCT_PROFIT_QUERY = `
*[_type == "product"]{
  _id,
  title,
  sku,
  price,
  "unitsSold": coalesce(sum(*[_type == "order" && status == "paid" && references(^._id)].cart[productRef._ref == ^._id].(coalesce(quantity, 0))), 0),
  "revenue": coalesce(sum(*[_type == "order" && status == "paid" && references(^._id)].cart[productRef._ref == ^._id].(coalesce(total, lineTotal, price * coalesce(quantity, 1)))), 0),
  "cogs": coalesce(sum(*[_type == "inventoryTransaction" && type == "sold" && product._ref == ^._id].(coalesce(quantity, 0) * coalesce(unitCost, 0))), 0)
} | order(_updatedAt desc)[0...500]
`

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

const ProductProfitability = () => {
  const client = useClient({apiVersion: API_VERSION})
  const [rows, setRows] = useState<ProfitabilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await client.fetch<ProfitabilityRow[]>(PRODUCT_PROFIT_QUERY)
      setRows(data || [])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const enhancedRows = useMemo(() => {
    return rows.map((row) => {
      const revenue = Number(row.revenue || 0)
      const cogs = Number(row.cogs || 0)
      const grossProfit = revenue - cogs
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
      return {...row, revenue, cogs, grossProfit, grossMargin}
    })
  }, [rows])

  const filteredRows = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return enhancedRows
    return enhancedRows.filter(
      (row) =>
        row.title?.toLowerCase().includes(needle) ||
        row.sku?.toLowerCase().includes(needle) ||
        row._id.toLowerCase().includes(needle),
    )
  }, [enhancedRows, filter])

  const totalGrossProfit = useMemo(
    () => filteredRows.reduce((sum, row: any) => sum + (row.grossProfit || 0), 0),
    [filteredRows],
  )

  const revenueExportRows = useMemo<RevenueExportRow[]>(
    () =>
      filteredRows.map((row) => ({
        label: row.title || row.sku || row._id,
        channel: 'product',
        revenue: row.revenue || 0,
        cogs: row.cogs || 0,
        grossProfit: row.grossProfit || 0,
        grossMargin: row.grossMargin || 0,
        unitsSold: row.unitsSold || 0,
        contribution: totalGrossProfit > 0 ? ((row.grossProfit || 0) / totalGrossProfit) * 100 : 0,
      })),
    [filteredRows, totalGrossProfit],
  )

  const handleExport = () => {
    if (!revenueExportRows.length) return
    exportRevenueReportCsv(revenueExportRows, 'product-profitability.csv')
  }

  return (
    <Stack space={4} padding={4}>
      <Flex align="center" justify="space-between">
        <Heading size={3}>📈 Product Profitability</Heading>
        <Flex gap={2}>
          <Button icon={RefreshIcon} mode="ghost" text="Refresh" onClick={fetchRows} disabled={loading} />
          <Button
            icon={DownloadIcon}
            text="Export CSV"
            onClick={handleExport}
            disabled={!revenueExportRows.length}
          />
        </Flex>
      </Flex>
      <Card padding={3} radius={3} shadow={1}>
        <Flex gap={2} align="center">
          <SearchIcon />
          <TextInput
            flex={1}
            placeholder="Search products by name or SKU"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
        </Flex>
      </Card>

      <Card radius={3} shadow={1} padding={0}>
        {loading ? (
          <Flex align="center" justify="center" padding={4}>
            <Spinner />
          </Flex>
        ) : (
          <Box style={{overflowX: 'auto'}}>
            <Grid
              columns={6}
              padding={3}
              gap={3}
              style={{fontWeight: 600, borderBottom: '1px solid var(--card-border-color)'}}
            >
              <Text size={1}>Product</Text>
              <Text size={1}>Units Sold</Text>
              <Text size={1}>Revenue</Text>
              <Text size={1}>COGS</Text>
              <Text size={1}>Gross Profit</Text>
              <Text size={1}>Margin</Text>
            </Grid>
            <Stack>
              {filteredRows.map((row: any) => (
                <Grid
                  key={row._id}
                  columns={6}
                  padding={3}
                  gap={3}
                  style={{borderBottom: '1px solid var(--card-border-color)'}}
                >
                  <Stack space={2}>
                    <Text weight="semibold">{row.title || 'Untitled product'}</Text>
                    <Text size={1} muted>
                      SKU: {row.sku || 'n/a'}
                    </Text>
                  </Stack>
                  <Text>{row.unitsSold ?? 0}</Text>
                  <Text>{currency.format(row.revenue || 0)}</Text>
                  <Text>{currency.format(row.cogs || 0)}</Text>
                  <Text>{currency.format(row.grossProfit || 0)}</Text>
                  <Text>{`${(row.grossMargin || 0).toFixed(1)}%`}</Text>
                </Grid>
              ))}
              {!filteredRows.length && (
                <Box padding={4}>
                  <Text size={1} muted>
                    No products match this filter.
                  </Text>
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </Card>
    </Stack>
  )
}

export default ProductProfitability
