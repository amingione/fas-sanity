import {useCallback, useEffect, useMemo, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Grid, Spinner, Stack, Text} from '@sanity/ui'
import {WarningOutlineIcon} from '@sanity/icons'
import {useRouter} from 'sanity/router'
import {useClient} from 'sanity'
import {
  getMerchantCoreWarnings,
  getMerchantFeedIssues,
  MerchantCenterProduct,
  isMerchantReady,
} from '../../utils/merchantCenter'

const PRODUCT_FEED_QUERY = `
*[_type == "product" && productType != "service"]{
  _id,
  title,
  "slug": slug.current,
  description,
  shortDescription,
  price,
  salePrice,
  availability,
  googleProductCategory,
  mpn,
  gtin,
  productType,
  canonicalUrl,
  "imageUrl": images[0].asset->url
}
`

type MissingMap = {
  gtin: MerchantCenterProduct[]
  mpn: MerchantCenterProduct[]
  googleProductCategory: MerchantCenterProduct[]
}

const StatCard = ({
  label,
  value,
  tone = 'primary',
}: {
  label: string
  value: string | number
  tone?: 'primary' | 'positive' | 'caution'
}) => {
  return (
    <Card
      padding={4}
      radius={2}
      tone={tone === 'caution' ? 'caution' : undefined}
      border
      shadow={1}
    >
      <Stack space={2}>
        <Text size={1} muted>
          {label}
        </Text>
        <Text size={3} weight="semibold">
          {value}
        </Text>
      </Stack>
    </Card>
  )
}

export function MerchantCenterDashboard() {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const [products, setProducts] = useState<MerchantCenterProduct[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docs = await client.fetch<MerchantCenterProduct[]>(PRODUCT_FEED_QUERY)
      setProducts(Array.isArray(docs) ? docs : [])
    } catch (err) {
      console.error('MerchantCenterDashboard: failed to load products', err)
      setError(err instanceof Error ? err.message : 'Failed to load products.')
      setProducts(null)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    load()
  }, [load])

  const readyCount = useMemo(() => {
    if (!products) return 0
    return products.filter((product) => isMerchantReady(product)).length
  }, [products])

  const missingMap = useMemo<MissingMap>(() => {
    const map: MissingMap = {
      gtin: [],
      mpn: [],
      googleProductCategory: [],
    }
    if (!products) return map

    for (const product of products) {
      const warnings = getMerchantCoreWarnings(product)
      warnings.forEach((field) => {
        if (field === 'GTIN') map.gtin.push(product)
        if (field === 'MPN') map.mpn.push(product)
        if (field === 'Google Category') map.googleProductCategory.push(product)
      })
    }
    return map
  }, [products])

  const total = products?.length ?? 0
  const openProduct = (product: MerchantCenterProduct) => {
    router.navigateIntent('edit', {id: product._id, type: 'product'})
  }

  return (
    <Stack space={4}>
      <Flex align="center" justify="space-between">
        <Stack space={3}>
          <Text size={3} weight="semibold">
            Merchant Center Status
          </Text>
          <Text size={1} muted>
            Track which products are ready for Google Shopping and fix missing data quickly.
          </Text>
        </Stack>
        <Button text="Refresh" mode="bleed" onClick={load} disabled={loading} />
      </Flex>

      {loading && (
        <Card padding={4} radius={2} tone="primary" border>
          <Flex align="center" gap={3}>
            <Spinner />
            <Text>Loading Merchant Center data…</Text>
          </Flex>
        </Card>
      )}

      {error && (
        <Card padding={4} radius={2} tone="critical" border>
          <Text>{error}</Text>
        </Card>
      )}

      {products && (
        <>
          <Grid columns={[1, 2, 4]} gap={4}>
            <StatCard label="Total products" value={total} />
            <StatCard label="Ready for Shopping" value={readyCount} tone="positive" />
            <StatCard label="Needs GTIN" value={missingMap.gtin.length} tone="caution" />
            <StatCard label="Needs MPN" value={missingMap.mpn.length} tone="caution" />
          </Grid>

          <Grid columns={[1, 2]} gap={4}>
            <StatCard
              label="Needs Google Category"
              value={missingMap.googleProductCategory.length}
              tone="caution"
            />
            <StatCard
              label="Other Feed Issues"
              value={
                products.filter((product) => getMerchantFeedIssues(product).length > 0).length -
                missingMap.gtin.length -
                missingMap.mpn.length -
                missingMap.googleProductCategory.length
              }
              tone="caution"
            />
          </Grid>
        </>
      )}

      {products && (
        <Stack space={4}>
          {(['gtin', 'mpn', 'googleProductCategory'] as const).map((field) => {
            const list = missingMap[field]
            if (!list.length) return null
            const label =
              field === 'gtin'
                ? 'Missing GTIN'
                : field === 'mpn'
                  ? 'Missing MPN'
                  : 'Missing Google Product Category'
            return (
              <Card key={field} padding={4} radius={2} border>
                <Stack space={3}>
                  <Flex align="center" gap={2}>
                    <WarningOutlineIcon />
                    <Text weight="semibold">
                      {label} • {list.length} product{list.length === 1 ? '' : 's'}
                    </Text>
                  </Flex>
                  <Stack as="ul" space={2} style={{listStyle: 'none', margin: 0, padding: 0}}>
                    {list.slice(0, 6).map((product) => (
                      <Box
                        key={`${field}-${product._id}`}
                        as="li"
                        padding={3}
                        style={{display: 'flex', justifyContent: 'space-between', gap: '1rem'}}
                      >
                        <Stack space={3}>
                          <Text weight="medium">{product.title || 'Untitled product'}</Text>
                          <Text size={1} muted>
                            {product._id}
                          </Text>
                        </Stack>
                        <Button text="Open" tone="primary" onClick={() => openProduct(product)} />
                      </Box>
                    ))}
                    {list.length > 6 && (
                      <Badge mode="outline">
                        +{list.length - 6} more product{list.length - 6 === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </Stack>
                </Stack>
              </Card>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}

export default MerchantCenterDashboard
