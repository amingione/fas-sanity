import {useCallback, useEffect, useMemo, useState} from 'react'
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
import {resolveNetlifyBase} from '../../utils/netlifyBase'

type ProfitabilityRow = {
  id: string
  title?: string | null
  price?: number | null
  sku?: string | null
  manufacturingCost?: number | null
  unitsSold: number
  revenue: number
  cogs: number
}

type MetricsPayload = {
  products?: ProfitabilityRow[]
  totals?: {unitsSold: number; revenue: number; cogs: number}
  updatedAt?: string
}

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})
const REFRESH_INTERVAL_MS = 30000

const ProductProfitability = () => {
  const [rows, setRows] = useState<ProfitabilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchRows = useCallback(async (options?: {silent?: boolean}) => {
    const silent = options?.silent
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const base = resolveNetlifyBase()
      const response = await fetch(`${base}/.netlify/functions/productMetrics`)
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail || `Request failed (${response.status})`)
      }
      const payload = (await response.json()) as MetricsPayload
      setRows(Array.isArray(payload.products) ? payload.products : [])
      setLastUpdated(payload.updatedAt || new Date().toISOString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load product metrics'
      setError(message)
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const intervalId = window.setInterval(() => fetchRows({silent: true}), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
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
        row.id.toLowerCase().includes(needle),
    )
  }, [enhancedRows, filter])

  const totalGrossProfit = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (row.grossProfit || 0), 0),
    [filteredRows],
  )

  const revenueExportRows = useMemo<RevenueExportRow[]>(
    () =>
      filteredRows.map((row) => ({
        label: row.title || row.sku || row.id,
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

  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return ''
    const parsed = Date.parse(lastUpdated)
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toLocaleTimeString()
    }
    return lastUpdated
  }, [lastUpdated])

  return (
    <Stack space={4} padding={4}>
      <Stack space={2}>
        <Flex align="center" justify="space-between">
          <Heading size={3}>📈 Product Profitability</Heading>
          <Flex gap={2} align="center">
            <Button
              icon={RefreshIcon}
              mode="ghost"
              text={refreshing ? 'Refreshing…' : 'Refresh'}
              onClick={() => fetchRows({silent: false})}
              disabled={loading || refreshing}
            />
            <Button
              icon={DownloadIcon}
              text="Export CSV"
              onClick={handleExport}
              disabled={!revenueExportRows.length}
            />
          </Flex>
        </Flex>
        <Flex justify="space-between" align="center">
          <Text size={1} muted>
            Auto-refreshes every {Math.round(REFRESH_INTERVAL_MS / 1000)}s
            {updatedLabel ? ` • Updated ${updatedLabel}` : ''}
          </Text>
          {error && (
            <Text size={1} style={{color: 'var(--card-critical-fg-color)'}}>
              {error}
            </Text>
          )}
        </Flex>
      </Stack>
      <Card padding={3} radius={3} shadow={1}>
        <Flex gap={2} align="center">
          <SearchIcon />
          <TextInput
            style={{flex: 1}}
            placeholder="Search products by name or SKU"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          {refreshing && !loading && (
            <Text size={1} muted>
              Refreshing…
            </Text>
          )}
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
              {filteredRows.map((row) => (
                <Grid
                  key={row.id}
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
                    {error ? 'Unable to load product metrics.' : 'No products match this filter.'}
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
