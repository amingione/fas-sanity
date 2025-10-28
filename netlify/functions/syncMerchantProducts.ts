import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {google} from 'googleapis'
import {deriveProductFeedFields} from '../../packages/sanity-config/src/utils/productFeed'

const sanity = createClient({
  projectId:
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    'r4og35qd',
  dataset:
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    'production',
  apiVersion: '2024-04-10',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

const MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const SERVICE_ACCOUNT_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const SITE_BASE_URL = (process.env.SITE_BASE_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '')
const SYNC_SECRET = process.env.MERCHANT_SYNC_SECRET

const REQUIRED_ENV = {
  GOOGLE_MERCHANT_ID: MERCHANT_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: SERVICE_ACCOUNT_KEY,
  SITE_BASE_URL: SITE_BASE_URL,
}

function portableTextToPlain(blocks: any): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (block?._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => child?.text || '').join('')
    })
    .filter((text) => text)
    .join('\n\n')
    .trim()
}

function selectDescription(product: any): string {
  const shortDesc = portableTextToPlain(product?.shortDescription)
  if (shortDesc) return shortDesc
  const fullDesc = portableTextToPlain(product?.description)
  if (fullDesc) return fullDesc
  return product?.title || ''
}

function toPositiveNumber(value: unknown): number | undefined {
  const num = Number(value)
  if (Number.isFinite(num) && num > 0) return num
  return undefined
}

function buildProductLink(slug?: any, canonicalUrl?: string): string | undefined {
  if (canonicalUrl) return canonicalUrl
  const slugStr = slug?.current || slug
  if (SITE_BASE_URL && typeof slugStr === 'string' && slugStr.trim()) {
    return `${SITE_BASE_URL}/product/${slugStr}`
  }
  return undefined
}

function buildImageUrl(images: any[]): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined
  const assetUrl = images[0]?.asset?.url
  if (assetUrl) return assetUrl
  return undefined
}

export const handler: Handler = async (event) => {
  try {
    if (SYNC_SECRET) {
      const providedSecret = event.headers['x-merchant-sync-secret'] || event.headers['X-MERCHANT-SYNC-SECRET']
      if (providedSecret !== SYNC_SECRET) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
      }
    }

    const missingEnv = Object.entries(REQUIRED_ENV)
      .filter(([, value]) => !value)
      .map(([key]) => key)
    if (missingEnv.length > 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Missing required environment variables: ${missingEnv.join(', ')}` }),
      }
    }

    const auth = new google.auth.JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/content'],
    })

    await auth.authorize()

const content = google.content({ version: 'v2.1', auth })

    const products = await sanity.fetch(
      `*[_type == "product" && defined(price) && price > 0]{
        _id,
        title,
        slug,
        sku,
        mpn,
        price,
        salePrice,
        onSale,
        availability,
        condition,
        shippingWeight,
        boxDimensions,
        installOnly,
        shippingLabel,
        productHighlights,
        productDetails,
        specifications[]{
          label,
          value,
        },
        attributes[]{
          name,
          value,
        },
        options[]{
          _type,
          title,
          colors[]{
            title,
          },
          sizes[]{
            title,
          },
        },
        color,
        size,
        material,
        productLength,
        productWidth,
        shortDescription,
        description,
        brand,
        canonicalUrl,
        "images": images[].asset->url,
        "categories": category[]->title
      }`
    )

    const entries: any[] = []
    const skipped: Array<{ id: string; reason: string }> = []

    products.forEach((product: any, index: number) => {
      try {
      const offerId = (product?.sku || product?._id || '').toString().trim()
      const link = buildProductLink(product?.slug, product?.canonicalUrl)
      const imageLink = buildImageUrl(product?.images || [])
      const price = toPositiveNumber(product?.price)
      if (!offerId || !price || !link || !imageLink) {
        skipped.push({ id: product?._id || offerId || `index-${index}`, reason: 'Missing offerId, price, link, or image.' })
        return
      }

      const derivedFeed = deriveProductFeedFields(product)
      const mpn = (product?.mpn || offerId).toString().trim() || offerId
      const availabilityMap: Record<string, string> = {
        in_stock: 'in stock',
        out_of_stock: 'out of stock',
        preorder: 'preorder',
        backorder: 'backorder',
      }
      const availability = availabilityMap[product?.availability || 'in_stock'] || 'in stock'
      const condition = (product?.condition || product?.productCondition || 'new').toString().toLowerCase()
      const description = selectDescription(product)
     const salePrice = product?.onSale ? toPositiveNumber(product?.salePrice) : undefined
      const currency = (product?.currency || product?.priceCurrency || 'USD').toString().toUpperCase() || 'USD'
      const shippingWeight = toPositiveNumber(product?.shippingWeight)
      const productType = Array.isArray(product?.categories) && product.categories.length > 0
        ? product.categories.join(' > ')
        : undefined
      const shippingLabel = product?.shippingLabel || (product?.installOnly ? 'install_only' : undefined)
      const productHighlights = Array.isArray(derivedFeed?.highlights) ? derivedFeed.highlights : []
      const productDetails = Array.isArray(derivedFeed?.details) ? derivedFeed.details : []

      const googleProduct: any = {
        offerId,
        channel: 'online',
        contentLanguage: 'en',
        targetCountry: 'US',
        title: product?.title,
        description: description || product?.title,
        link,
        imageLink,
        condition: ['new', 'used', 'refurbished'].includes(condition) ? condition : 'new',
        availability,
        price: { value: price.toFixed(2), currency },
        brand: product?.brand || 'F.A.S. Motorsports',
        mpn,
      }

      if (salePrice && salePrice < price) {
        googleProduct.salePrice = { value: salePrice.toFixed(2), currency }
      }

     if (productType) {
        googleProduct.productType = productType
      }

      if (shippingWeight) {
        googleProduct.shippingWeight = `${shippingWeight} lb`
      }

      if (shippingLabel) {
        googleProduct.shippingLabel = shippingLabel
      }

      if (productHighlights.length > 0) {
        googleProduct.productHighlights = productHighlights.slice(0, 10)
      }

      if (productDetails.length > 0) {
        googleProduct.productDetails = productDetails
      }

      if (derivedFeed?.color) {
        googleProduct.color = derivedFeed.color
      }

      if (Array.isArray(derivedFeed?.sizes) && derivedFeed.sizes.length > 0) {
        googleProduct.sizes = derivedFeed.sizes
      }

      if (derivedFeed?.material) {
        googleProduct.material = derivedFeed.material
      }

      if (derivedFeed?.productLength) {
        googleProduct.productLength = derivedFeed.productLength
      }

      if (derivedFeed?.productWidth) {
        googleProduct.productWidth = derivedFeed.productWidth
      }


      entries.push({
        batchId: index,
        merchantId: MERCHANT_ID,
        method: 'insert',
        product: googleProduct,
      })
      } catch (err: any) {
        skipped.push({ id: product?._id || `index-${index}`, reason: err?.message || 'Failed to build product payload' })
      }
    })

    if (entries.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No products ready for sync', skipped }),
      }
    }

    let response
    try {
      response = await content.products.custombatch({
        requestBody: {
          entries,
        },
      })
    } catch (apiErr: any) {
      console.error('Google Content API error', apiErr?.response?.data || apiErr)
      throw apiErr
    }

    const errors = (response.data?.entries || [])
      .filter((entry: any) => entry?.errors)
      .map((entry: any) => ({
        batchId: entry?.batchId,
        errors: entry?.errors?.errors,
      }))

    return {
      statusCode: 200,
      body: JSON.stringify({ synced: entries.length, skipped, errors }),
    }
  } catch (err: any) {
    console.error('syncMerchantProducts error', err)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err?.message || 'Failed to sync products',
        details: err?.response?.data || err?.errors || err,
      }),
    }
  }
}
