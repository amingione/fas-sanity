import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Card, Stack, Text, Heading, Flex, Box } from '@sanity/ui'

export default function FinancialDashboard() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [metrics, setMetrics] = useState({
    ordersLast30: 0,
    revenueLast90: 0,
    avgOrderValue: 0,
    topProducts: [] as string[]
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const invoices = await client.fetch(`*[_type == "invoice" && defined(amount)]{
          _createdAt, amount, quote->{ products[]->{title} }
        }`)

        const now = new Date()
        const last30 = invoices.filter((i: any) => new Date(i._createdAt) >= new Date(now.getTime() - 30 * 86400000))
        const last90 = invoices.filter((i: any) => new Date(i._createdAt) >= new Date(now.getTime() - 90 * 86400000))

        const revenue = last90.reduce((sum: number, i: { amount?: number }) => sum + (i.amount || 0), 0)
        const avg = revenue / (last90.length || 1)

        const productTally: Record<string, number> = {}
        invoices.forEach((i: { _createdAt: string; amount?: number; quote?: { products?: { title?: string }[] } }) => {
          i.quote?.products?.forEach((p: any) => {
            if (p?.title) productTally[p.title] = (productTally[p.title] || 0) + 1
          })
        })

        const topProducts = Object.entries(productTally)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([title]) => title)

        setMetrics({
          ordersLast30: last30.length,
          revenueLast90: revenue,
          avgOrderValue: avg,
          topProducts
        })
      } catch (err: any) {
        setError('Failed to load financial metrics.')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [client])

  return (
    <Card padding={4} radius={3} shadow={1}>
      <Heading size={2}>📊 Financial Snapshot</Heading>
      {loading ? (
        <Text>Loading...</Text>
      ) : error ? (
        <Text style={{ color: 'red' }}>{error}</Text>
      ) : (
        <Stack space={4} marginTop={4}>
          <Flex gap={5} wrap="wrap">
            <Box flex={1} style={{ minWidth: 250 }}>
              <Text size={1} weight="semibold">🧾 Orders (Last 30 Days)</Text>
              <Text size={3}>{metrics.ordersLast30}</Text>
            </Box>
            <Box flex={1} style={{ minWidth: 250 }}>
              <Text size={1} weight="semibold">💰 Revenue (Last 90 Days)</Text>
              <Text size={3}>${metrics.revenueLast90.toFixed(2)}</Text>
            </Box>
            <Box flex={1} style={{ minWidth: 250 }}>
              <Text size={1} weight="semibold">📈 Average Order Value</Text>
              <Text size={3}>${metrics.avgOrderValue.toFixed(2)}</Text>
            </Box>
          </Flex>
          <Box>
            <Text size={1} weight="semibold">🏆 Top Products</Text>
            <Stack marginTop={2}>
              {metrics.topProducts.map((product, i) => (
                <Text key={i}>• {product}</Text>
              ))}
            </Stack>
          </Box>
        </Stack>
      )}
    </Card>
  )
}
