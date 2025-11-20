import {useEffect, useState} from 'react'
import {Box, Card, Flex, Grid, Heading, Spinner, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'

const QUERY = `*[_type == "product" && defined(price) && productType != "service"] | order(title asc)[0...200]{
  _id,
  title,
  price,
  manufacturingCost,
  wholesalePriceStandard,
  wholesalePricePreferred,
  wholesalePricePlatinum,
  minimumWholesaleQuantity,
  availableForWholesale
}`

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value)
}

const calcMargin = (retail?: number | null, cost?: number | null) => {
  if (typeof retail !== 'number' || retail <= 0) return '—'
  if (typeof cost !== 'number') return '—'
  const pct = ((retail - cost) / retail) * 100
  if (!Number.isFinite(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

const WholesalePricingCalculator = () => {
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
          Wholesale Pricing Calculator
        </Heading>
        {!products.length ? (
          <Text size={1} muted>
            No physical products found.
          </Text>
        ) : (
          <Grid columns={[1, 1, 2]} gap={3}>
            {products.map((product) => (
              <Card key={product._id} padding={4} radius={3} border>
                <Stack space={2}>
                  <Text weight="medium">{product.title}</Text>
                  <Text size={1} muted>
                    Retail: {formatCurrency(product.price)} • Min QTY:{' '}
                    {product.minimumWholesaleQuantity || 1}
                  </Text>
                  <Text size={1}>
                    Manufacturing cost: {formatCurrency(product.manufacturingCost)} ({calcMargin(product.price, product.manufacturingCost)} margin)
                  </Text>
                  <Stack space={1}>
                    <Text size={1} muted>Wholesale tiers</Text>
                    <Text size={1}>
                      Standard: {formatCurrency(product.wholesalePriceStandard)}
                      {product.wholesalePriceStandard ? '' : ' (set with helper)'}
                    </Text>
                    <Text size={1}>Preferred: {formatCurrency(product.wholesalePricePreferred)}</Text>
                    <Text size={1}>Platinum: {formatCurrency(product.wholesalePricePlatinum)}</Text>
                  </Stack>
                  <Text size={1} muted>
                    {product.availableForWholesale === false ? 'Wholesale disabled' : 'Available for wholesale'}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Box>
  )
}

export default WholesalePricingCalculator
