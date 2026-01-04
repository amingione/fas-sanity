/// <reference lib="es2015" />
/**
 * Bulk updates Stripe product metadata.product_url using the product's Sanity slug.
 * Run with: tsx bulkUpdateProductUrls.ts
 */
// ===== Environment Setup and Client Wiring =====
import 'dotenv/config'
import Stripe from 'stripe'
import {createClient, type SanityClient} from './sanityClientShim.js'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

if (!stripeSecretKey) {
  console.error('Missing STRIPE_SECRET_KEY environment variable')
  process.exit(1)
}

const stripe = new Stripe(stripeSecretKey)

const PRODUCT_METADATA_SLUG_KEYS = ['sanity_slug', 'slug', 'product_slug', 'productSlug', 'handle']
const PRODUCT_METADATA_ID_KEYS = [
  'sanity_id',
  'sanityId',
  'sanity_document_id',
  'sanityDocId',
  'sanity_doc_id',
  'sanityProductId',
  'sanity_product_id',
  'sanityDocumentId',
  'document_id',
  'documentId',
  'product_document_id',
  'productDocumentId',
]

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID

const SANITY_STUDIO_DATASET =
  process.env.SANITY_STUDIO_DATASET || 'production'

const SANITY_API_TOKEN =
  process.env.SANITY_API_TOKEN

const SANITY_API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-04-10'

const canInitSanity = Boolean(SANITY_STUDIO_PROJECT_ID && SANITY_STUDIO_DATASET)

const sanityClient: SanityClient | null = canInitSanity
  ? createClient({
      projectId: SANITY_STUDIO_PROJECT_ID as string,
      dataset: SANITY_STUDIO_DATASET,
      token: SANITY_API_TOKEN || undefined,
      apiVersion: SANITY_API_VERSION,
      useCdn: !SANITY_API_TOKEN,
    })
  : null

if (!canInitSanity) {
  console.warn(
    'Sanity project ID or dataset is missing. Products without metadata.sanity_slug will be skipped.',
  )
} else if (!SANITY_API_TOKEN) {
  console.warn(
    'No Sanity token found; attempting unauthenticated reads. Ensure the dataset is public if slugs still fail to resolve.',
  )
}

// ===== Helper Functions and Slug Caching =====
type SanityProductInfo = {
  slug?: string
  title?: string
  shippingWeight?: number
  boxDimensions?: string
}

const sanitySlugCache = new Map<string, SanityProductInfo | null>()
const loggedMissingSanityIds = new Set<string>()

function normalizeSanityId(id?: string | null): string {
  if (!id) return ''
  const trimmed = id.toString().trim()
  if (!trimmed) return ''
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function idVariants(id: string): string[] {
  const base = normalizeSanityId(id)
  if (!base) return []
  const variants = new Set<string>([base, `drafts.${base}`])
  return Array.from(variants)
}

function pickMetadataValue(metadata: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }
  return undefined
}

function getCachedSanityInfo(rawId: string | undefined): SanityProductInfo | null | undefined {
  if (!rawId) return undefined
  const direct = sanitySlugCache.get(rawId)
  if (direct !== undefined) return direct

  const normalized = normalizeSanityId(rawId)
  if (!normalized) return undefined

  const baseHit = sanitySlugCache.get(normalized)
  if (baseHit !== undefined) return baseHit

  const draftHit = sanitySlugCache.get(`drafts.${normalized}`)
  if (draftHit !== undefined) return draftHit

  return undefined
}

async function primeSanitySlugCache(products: Stripe.Product[]): Promise<void> {
  if (!sanityClient) return

  const idsToFetch = new Set<string>()

  for (const product of products) {
    const metadata = (product.metadata || {}) as Record<string, string>
    const metadataId = pickMetadataValue(metadata, PRODUCT_METADATA_ID_KEYS)
    const normalizedId = normalizeSanityId(metadataId)
    if (!normalizedId) continue
    if (sanitySlugCache.has(normalizedId)) continue
    idsToFetch.add(normalizedId)
  }

  if (!idsToFetch.size) return

  const variantIds = Array.from(idsToFetch).flatMap((id) => idVariants(id))
  const uniqueIds = Array.from(new Set(variantIds))

  if (uniqueIds.length === 0) return

  try {
    const docs: Array<{
      _id: string
      slug?: string | null
      title?: string | null
      shippingWeight?: number | null
      boxDimensions?: string | null
    }> = await sanityClient.fetch(
      `*[_type == "product" && _id in $ids]{_id,"slug": slug.current,title,shippingWeight,boxDimensions}`,
      {ids: uniqueIds},
    )

    const resolvedBases = new Set<string>()

    for (const doc of docs) {
      const baseId = normalizeSanityId(doc._id)
      if (!baseId) continue

      const info: SanityProductInfo = {
        slug: typeof doc.slug === 'string' ? doc.slug.trim() || undefined : undefined,
        title: typeof doc.title === 'string' ? doc.title.trim() || undefined : undefined,
        shippingWeight:
          typeof doc.shippingWeight === 'number' && Number.isFinite(doc.shippingWeight)
            ? doc.shippingWeight
            : undefined,
        boxDimensions:
          typeof doc.boxDimensions === 'string' ? doc.boxDimensions.trim() || undefined : undefined,
      }

      sanitySlugCache.set(baseId, info)
      sanitySlugCache.set(`drafts.${baseId}`, info)
      resolvedBases.add(baseId)

      if (!info.slug && !loggedMissingSanityIds.has(baseId)) {
        console.log(
          `Sanity product ${baseId} is missing a slug; associated Stripe items will be skipped until it is populated.`,
        )
        loggedMissingSanityIds.add(baseId)
      }
    }

    for (const baseId of Array.from(idsToFetch)) {
      if (resolvedBases.has(baseId)) continue
      sanitySlugCache.set(baseId, null)
      sanitySlugCache.set(`drafts.${baseId}`, null)
      if (!loggedMissingSanityIds.has(baseId)) {
        console.log(
          `Sanity product ${baseId} was not found; associated Stripe items will be skipped until the metadata is populated.`,
        )
        loggedMissingSanityIds.add(baseId)
      }
    }
  } catch (error) {
    console.error('Failed to fetch slugs from Sanity:', error)
  }
}

// ===== Main Loop and Update Logic =====
async function updateProductUrls() {
  let startingAfter: string | undefined = undefined

  while (true) {
    const response: Stripe.Response<Stripe.ApiList<Stripe.Product>> = await stripe.products.list({
      limit: 100,
      starting_after: startingAfter,
    })

    if (response.data.length === 0) {
      break
    }

    await primeSanitySlugCache(response.data)

    for (const product of response.data) {
      const metadata = (product.metadata || {}) as Record<string, string>
      const directSlug = pickMetadataValue(metadata, PRODUCT_METADATA_SLUG_KEYS)
      const trimmedDirectSlug = directSlug?.trim() || ''

      let resolvedSlug = trimmedDirectSlug
      let slugSource: 'metadata' | 'sanity' = 'metadata'
      let resolvedTitle =
        (typeof metadata.sanity_title === 'string' && metadata.sanity_title.trim()) || undefined

      const metadataId = pickMetadataValue(metadata, PRODUCT_METADATA_ID_KEYS)
      const normalizedId = normalizeSanityId(metadataId)
      let sanityInfo: SanityProductInfo | null | undefined
      let shippingWeight: number | undefined
      let boxDimensions: string | undefined

      if (metadataId || normalizedId) {
        sanityInfo = getCachedSanityInfo(metadataId || normalizedId)
        if (sanityInfo && sanityInfo !== null) {
          resolvedTitle = sanityInfo.title || resolvedTitle
          shippingWeight = sanityInfo.shippingWeight
          boxDimensions = sanityInfo.boxDimensions
        }
      }

      if (!resolvedSlug) {
        if (sanityInfo && sanityInfo !== null && sanityInfo.slug?.trim()) {
          resolvedSlug = sanityInfo.slug.trim()
          slugSource = 'sanity'
        } else {
          const reason = !metadataId
            ? 'missing Sanity product id in Stripe metadata'
            : sanityInfo === null
              ? 'Sanity document not found'
              : 'unable to locate a slug in Sanity'

          const productLabel = product.name ?? resolvedTitle ?? normalizedId ?? product.id
          console.log(`Skipping product ${productLabel}: ${reason}.`)
          continue
        }
      }

      if (!resolvedSlug) {
        const productLabel = product.name ?? resolvedTitle ?? normalizedId ?? product.id
        console.log(`Skipping product ${productLabel}: derived slug was empty after trimming.`)
        continue
      }

      const desiredUrl = `https://fasmotorsports.com/shop/${resolvedSlug}`
      const existingUrl = metadata.product_url
      const existingSlug = metadata.sanity_slug?.trim()
      const existingWeight = metadata.shipping_weight
      const existingDimensions = metadata.shipping_box_dimensions

      const logName = product.name ?? resolvedTitle ?? normalizedId ?? product.id

      if (
        existingUrl === desiredUrl &&
        existingSlug === resolvedSlug &&
        (shippingWeight === undefined || existingWeight === String(shippingWeight)) &&
        (boxDimensions === undefined || existingDimensions === boxDimensions)
      ) {
        console.log(`Skipped product ${logName}: already up to date.`)
        continue
      }

      const updatedMetadata: Record<string, string> = {
        ...metadata,
        sanity_slug: resolvedSlug,
        product_url: desiredUrl,
      }

      if (shippingWeight !== undefined && Number.isFinite(shippingWeight)) {
        updatedMetadata.shipping_weight = String(shippingWeight)
      }

      if (boxDimensions) {
        updatedMetadata.shipping_box_dimensions = boxDimensions
      }

      try {
        await stripe.products.update(product.id, {
          metadata: updatedMetadata,
        })

        console.log(
          `Updated product ${logName}: sanity_slug=${resolvedSlug}, product_url=${desiredUrl}, shipping_weight=${shippingWeight ?? 'n/a'}, shipping_box_dimensions=${boxDimensions ?? 'n/a'} (slug source: ${slugSource}).`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error)
        console.error(`Failed to update product ${logName}: ${message}`)
      }
    }

    if (!response.has_more) {
      break
    }

    startingAfter = response.data[response.data.length - 1].id
  }
}

updateProductUrls()
  .then(() => {
    console.log('Completed updating product URLs.')
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error(`Unexpected error while updating product URLs: ${message}`)
    process.exit(1)
  })
