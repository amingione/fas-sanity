import {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {Box, Button, Card, Code, Flex, Inline, Label, Spinner, Stack, Text} from '@sanity/ui'
import {RefreshIcon, CopyIcon, WarningOutlineIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {
  buildProductUrl,
  getMerchantFeedIssues,
  isMerchantReady,
  MerchantCenterProduct,
  portableTextToPlain,
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
}|order(title asc)
`

const encode = (value?: string): string => {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

type ValidationIssue = {
  id: string
  title?: string
  missing: string[]
}

const buildXml = (items: MerchantCenterProduct[]): string => {
  const xmlItems = items
    .map((item) => {
      const price = typeof item.price === 'number' ? item.price.toFixed(2) : undefined
      const description =
        portableTextToPlain(item.description) || portableTextToPlain(item.shortDescription)
      const link = buildProductUrl(item)
      return [
        '<item>',
        `<g:id>${encode(item._id)}</g:id>`,
        `<title>${encode(item.title)}</title>`,
        `<link>${encode(link)}</link>`,
        `<description>${encode(description)}</description>`,
        item.imageUrl ? `<g:image_link>${encode(item.imageUrl)}</g:image_link>` : '',
        item.googleProductCategory
          ? `<g:google_product_category>${encode(item.googleProductCategory)}</g:google_product_category>`
          : '',
        price ? `<g:price>${price} USD</g:price>` : '',
        item.availability ? `<g:availability>${encode(item.availability)}</g:availability>` : '',
        item.mpn ? `<g:mpn>${encode(item.mpn)}</g:mpn>` : '',
        item.gtin ? `<g:gtin>${encode(item.gtin)}</g:gtin>` : '',
        '</item>',
      ]
        .filter(Boolean)
        .join('')
    })
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    '<title>FAS Motorsports Product Feed</title>',
    '<link>https://fasmotorsports.com</link>',
    '<description>Automatically generated Google Merchant Center feed.</description>',
    xmlItems,
    '</channel>',
    '</rss>',
  ].join('')
}

export const MerchantFeedPreview = forwardRef<HTMLDivElement, Record<string, unknown>>(
  (_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const [products, setProducts] = useState<MerchantCenterProduct[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const results = await client.fetch<MerchantCenterProduct[]>(PRODUCT_FEED_QUERY)
      setProducts(Array.isArray(results) ? results : [])
    } catch (err) {
      console.error('merchant-feed-preview: failed to load feed data', err)
      setError(err instanceof Error ? err.message : 'Failed to load product feed data.')
      setProducts(null)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const validation = useMemo(() => {
    if (!products) return []
    return products
      .map((product) => {
        const missing = getMerchantFeedIssues(product)
        return missing.length
          ? {
              id: product._id,
              title: product.title,
              missing,
            }
          : null
      })
      .filter(Boolean) as ValidationIssue[]
  }, [products])

  const validItems = useMemo(() => {
    if (!products) return []
    return products.filter((product) => isMerchantReady(product))
  }, [products])

  const xmlPreview = useMemo(() => {
    if (!validItems.length) return ''
    return buildXml(validItems)
  }, [validItems])

  const handleCopy = useCallback(async () => {
    if (!xmlPreview) return
    try {
      await navigator.clipboard.writeText(xmlPreview)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('merchant-feed-preview: copy failed', err)
    }
  }, [xmlPreview])

  return (
    <Stack ref={ref} space={5}>
      <Flex align="center" justify="space-between">
        <Stack space={5}>
          <Text size={3} weight="semibold">
            Merchant Center Feed Preview
          </Text>
          <Text size={1} muted>
            Review the generated XML feed before uploading to Google Merchant Center. Services are
            automatically excluded.
          </Text>
        </Stack>
        <Inline space={3}>
          <Button
            icon={RefreshIcon}
            text="Refresh"
            mode="bleed"
            tone="primary"
            onClick={loadProducts}
            disabled={loading}
          />
          <Button
            icon={CopyIcon}
            text={copied ? 'Copied!' : 'Copy XML'}
            tone="primary"
            onClick={handleCopy}
            disabled={!xmlPreview}
          />
        </Inline>
      </Flex>

      {loading && (
        <Card padding={5} radius={2} tone="primary" border>
          <Flex align="center" justify="center" gap={4}>
            <Spinner muted />
            <Text>Generating feed preview…</Text>
          </Flex>
        </Card>
      )}

      {error && (
        <Card padding={4} radius={2} tone="critical" border>
          <Text>{error}</Text>
        </Card>
      )}

      {products && !products.length && (
        <Card padding={5} radius={2} tone="caution" border>
          <Text>
            No eligible products found. Add physical/bundle products to see the feed preview.
          </Text>
        </Card>
      )}

      {validation.length > 0 && (
        <Card padding={5} radius={2} tone="caution" border>
          <Stack space={4}>
            <Flex align="center" gap={5}>
              <WarningOutlineIcon />
              <Text weight="semibold">
                {validation.length} product{validation.length === 1 ? '' : 's'} need attention
              </Text>
            </Flex>
            <Stack space={5}>
              {validation.map((issue) => (
                <Box key={issue.id}>
                  <Label muted size={1} style={{marginBottom: '0.5rem'}}>
                    {issue.title || issue.id}
                  </Label>
                  <Text size={1}>Missing: {issue.missing.join(', ')}</Text>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {xmlPreview && (
        <Card padding={4} radius={2} border shadow={1}>
          <Stack space={5}>
            <Inline space={4} style={{alignItems: 'center'}}>
              <Text weight="semibold">XML Preview</Text>
              <Text size={1} muted>
                {validItems.length} product{validItems.length === 1 ? '' : 's'} ready
              </Text>
            </Inline>
            <Code
              language="xml"
              style={{
                display: 'block',
                maxHeight: 400,
                overflow: 'auto',
                fontSize: 12,
              }}
            >
              {xmlPreview}
            </Code>
          </Stack>
        </Card>
      )}
    </Stack>
  )
  },
)

MerchantFeedPreview.displayName = 'MerchantFeedPreview'

export default MerchantFeedPreview
