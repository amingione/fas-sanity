import {useState} from 'react'
import {Button, Card, Flex, Stack, Text, useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import {useClient} from 'sanity'

const API_VERSION = '2024-10-01'
const DEFAULT_SITE_URL = 'https://www.fasmotorsports.com'

type MerchantFeedPayload = {
  _id: string
  _type: 'merchantFeed'
  sku: string
  gtin?: string
  mpn?: string
  title?: string
  description?: string
  link?: string
  image_link?: string
  availability?: string
  price?: string
  sale_price?: string | null
  brand?: string
  linkedProduct: {_type: 'reference'; _ref: string}
}

function portableTextToPlainText(value: any): string {
  if (!Array.isArray(value)) return typeof value === 'string' ? value : ''
  return value
    .map((block) => {
      if (block?._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => child?.text || '').join('')
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function formatPrice(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return `${value.toFixed(2)} USD`
}

function resolveSiteBase(): string {
  const envUrl =
    process.env.SANITY_STUDIO_SITE_URL ||
    process.env.SITE_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.URL
  return (envUrl || DEFAULT_SITE_URL).replace(/\/$/, '')
}

const SyncMerchantFeedAction: DocumentActionComponent = (props) => {
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const doc = (props.draft || props.published) as Record<string, any> | null
  if (!doc || doc._type !== 'product') return null

  const baseId = (props.id || doc._id || '').replace(/^drafts\./, '')

  const handleSync = async () => {
    if (busy) return
    setBusy(true)
    try {
      const snapshot = await client.fetch(
        `*[_id == $id][0]{
          _id,
          sku,
          gtin,
          mpn,
          title,
          description,
          slug,
          price,
          salePrice,
          brand,
          status,
          images[]{asset->{url}},
          merchantData
        }`,
        {id: baseId},
      )

      if (!snapshot) {
        throw new Error('Could not load product')
      }
      if (!snapshot.sku) {
        throw new Error('Product needs an SKU before syncing merchant feed')
      }

      const slug = snapshot.slug?.current || snapshot.slug || snapshot.sku
      const siteBase = resolveSiteBase()
      const link = `${siteBase}/shop/${slug}`
      const image_link = snapshot.images?.[0]?.asset?.url
      const description = portableTextToPlainText(snapshot.description) || snapshot.title
      const price = formatPrice(snapshot.price)
      const sale_price = snapshot.salePrice ? formatPrice(snapshot.salePrice) : null
      const mpn = snapshot.mpn || snapshot.sku

      const merchantDoc: MerchantFeedPayload = {
        _id: `merchantFeed-${snapshot.sku}`,
        _type: 'merchantFeed',
        sku: snapshot.sku,
        gtin: snapshot.gtin,
        mpn,
        title: snapshot.title,
        description,
        link,
        image_link,
        availability: snapshot.status === 'active' ? 'in stock' : 'out of stock',
        price,
        sale_price,
        brand: snapshot.brand || 'F.A.S. Motorsports',
        linkedProduct: {_type: 'reference', _ref: baseId},
      }

      const tx = client.transaction()
      tx.createOrReplace(merchantDoc as any)
      tx.patch(baseId, (patch) =>
        patch
          .setIfMissing({merchantData: {}})
          .set({merchantData: {...snapshot.merchantData, linkedMerchant: merchantDoc.linkedProduct}}),
      )

      await tx.commit({autoGenerateArrayKeys: true})

      toast.push({
        status: 'success',
        title: 'Merchant feed synced',
        description: `Created/updated merchantFeed-${snapshot.sku}`,
      })
      props.onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Merchant sync failed', description: message})
      setBusy(false)
    }
  }

  return {
    label: 'Sync Merchant Feed',
    tone: 'primary',
    disabled: busy,
    onHandle: handleSync,
    dialog: busy
      ? {
          type: 'dialog',
          onClose: () => props.onComplete(),
          content: (
            <Card padding={4}>
              <Stack space={3}>
                <Text size={2} weight="semibold">
                  Syncing merchant feed…
                </Text>
                <Text size={1} muted>
                  Creating or updating the merchantFeed document and linking it to this product.
                </Text>
                <Flex justify="flex-end">
                  <Button text="Close" onClick={() => props.onComplete()} tone="primary" />
                </Flex>
              </Stack>
            </Card>
          ),
        }
      : undefined,
  }
}

export default SyncMerchantFeedAction
