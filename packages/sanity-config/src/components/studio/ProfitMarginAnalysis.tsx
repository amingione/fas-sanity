import {useEffect, useMemo, useState} from 'react'
import {Box, Card, Flex, Grid, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'

const QUERY = `*[_type == "product" && defined(price) && productType != "service"]{
  _id,
  title,
  price,
  manufacturingCost,
  wholesalePriceStandard,
  wholesalePricePreferred,
  wholesalePricePlatinum
}`

const calcMarginPct = (retail?: number | null, cost?: number | null) => {
  if (typeof retail !== 'number' || retail <= 0 || typeof cost !== 'number') return null
  return ((retail - cost) / retail) * 100
}

const ProfitMarginAnalysis = () => {
  const client = useClient({apiVersion: '2024-10-01'})
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    client
      .fetch(QUERY)
      .then((result) => {
        if (!cancelled) setProducts(result || [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client])

  const analysis = useMemo(() => {
    if (!products.length) {
      return {
        avgMargin: 0,
        lowest: [],
        missingWholesale: [],
      }
    }
    const marginValues: Array<{title: string; pct: number}> = []
    const missing: string[] = []
    for (const product of products) {
      const pct = calcMarginPct(product.price, product.manufacturingCost)
      if (pct !== null && Number.isFinite(pct)) {
        marginValues.push({title: product.title, pct})
      }
      if (
        typeof product.wholesalePriceStandard !== 'number' &&
        typeof product.wholesalePricePreferred !== 'number' &&
        typeof product.wholesalePricePlatinum !== 'number'
      ) {
        missing.push(product.title)
      }
    }
    marginValues.sort((a, b) => a.pct - b.pct)
    const lowest = marginValues.slice(0, 3)
    const avgMargin =
      marginValues.reduce((sum, entry) => sum + entry.pct, 0) / (marginValues.length || 1)
    return {
      avgMargin,
      lowest,
      missingWholesale: missing.slice(0, 5),
    }
  }, [products])

  if (loading) {
    return (
      <Flex align="center" justify="center" style={{height: '100%'}}>
        <Spinner muted />
      </Flex>
    )
  }

  return (
    <Box padding={4} style={{overflowY: 'auto'}}>
      <Stack space={4}>
        <Heading as="h2" size={3}>
          Profit Margin Analysis
        </Heading>
        <Card padding={4} radius={3} border>
          <Stack space={1}>
            <Text size={1} muted>Average retail margin</Text>
            <Text weight="semibold">{analysis.avgMargin.toFixed(1)}%</Text>
          </Stack>
        </Card>
        <Grid columns={[1, 1, 2]} gap={3}>
          <Card padding={4} radius={3} border>
            <Stack space={2}>
              <Text weight="medium">Lowest margins</Text>
              {!analysis.lowest.length ? (
                <Text size={1} muted>All products have healthy margins.</Text>
              ) : (
                analysis.lowest.map((entry) => (
                  <Flex key={entry.title} justify="space-between">
                    <Text size={1}>{entry.title}</Text>
                    <Text size={1}>{entry.pct.toFixed(1)}%</Text>
                  </Flex>
                ))
              )}
            </Stack>
          </Card>
          <Card padding={4} radius={3} border>
            <Stack space={2}>
              <Text weight="medium">Missing wholesale pricing</Text>
              {!analysis.missingWholesale.length ? (
                <Text size={1} muted>All products have wholesale tiers configured.</Text>
              ) : (
                analysis.missingWholesale.map((title) => (
                  <Text key={title} size={1}>
                    {title}
                  </Text>
                ))
              )}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    </Box>
  )
}

export default ProfitMarginAnalysis
