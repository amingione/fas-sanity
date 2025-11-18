import type {PortableTextBlock} from '@portabletext/types'
import type {ImageUrlBuilder} from '@sanity/image-url/lib/types/builder'

type SanityImageLike = {
  asset?: {
    _ref?: string
    url?: string
  }
}

type CollapsibleFeature = {
  title?: string
  summary?: string
}

type SpecItem = {
  label?: string
  value?: string
}

type ProductDocumentLike = {
  _id?: string
  title?: string
  slug?: {current?: string}
  canonicalUrl?: string
  description?: PortableTextBlock[]
  shortDescription?: PortableTextBlock[]
  sku?: string
  mpn?: string
  gtin?: string
  brand?: string
  price?: number
  salePrice?: number
  priceCurrency?: string
  availability?: string
  condition?: string
  images?: SanityImageLike[]
  keyFeatures?: CollapsibleFeature[]
  specifications?: SpecItem[]
  structuredDataOverrides?: string
}

export type BuildProductJsonLdOptions = {
  siteUrl?: string
  imageBuilder?: ImageUrlBuilder
  defaultCurrency?: string
  refreshKey?: number
}

export type ProductJsonLdResult = {
  json: Record<string, unknown> | null
  errors: string[]
  warnings: string[]
}

const availabilityMap: Record<string, string> = {
  in_stock: 'https://schema.org/InStock',
  out_of_stock: 'https://schema.org/OutOfStock',
  preorder: 'https://schema.org/PreOrder',
  backorder: 'https://schema.org/BackOrder',
}

const conditionMap: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  refurbished: 'https://schema.org/RefurbishedCondition',
  used: 'https://schema.org/UsedCondition',
}

const portableTextToPlainText = (blocks?: PortableTextBlock[]) => {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (!block) return ''
      if (typeof block === 'string') return block
      const children = (block as any)?.children
      if (Array.isArray(children)) {
        return children
          .map((child) => (typeof child?.text === 'string' ? child.text : ''))
          .join('')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

const buildImageUrls = (images: SanityImageLike[] | undefined, builder?: ImageUrlBuilder) => {
  if (!Array.isArray(images)) return []
  return images
    .map((image) => {
      if (!image) return undefined
      if (builder) {
        try {
          return builder.image(image as any).width(1600).quality(85).url()
        } catch {
          return undefined
        }
      }
      return image.asset?.url
    })
    .filter((url): url is string => typeof url === 'string' && Boolean(url))
}

const deepMerge = (
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const output: Record<string, unknown> = {...base}
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key]) &&
      output[key] !== null
    ) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      output[key] = value
    }
  }
  return output
}

export const buildProductJsonLd = (
  product: ProductDocumentLike | null | undefined,
  options: BuildProductJsonLdOptions = {},
): ProductJsonLdResult => {
  const errors: string[] = []
  const warnings: string[] = []

  if (!product) {
    return {json: null, errors: ['No product data available'], warnings}
  }

  const name = product.title?.trim()
  if (!name) {
    errors.push('Product title is required to generate JSON-LD.')
  }

  const description = portableTextToPlainText(product.description) || portableTextToPlainText(product.shortDescription)
  if (!description) {
    warnings.push('Consider adding a description for richer structured data.')
  }

  const price = typeof product.salePrice === 'number' ? product.salePrice : product.price
  if (typeof price !== 'number') {
    errors.push('Add a price or sale price so the Offer can be generated.')
  }

  const priceCurrency = product.priceCurrency || options.defaultCurrency || 'USD'

  const slug = product.slug?.current?.replace(/^\//, '')
  const siteUrl = (options.siteUrl || '').replace(/\/$/, '') || 'https://fasmotorsports.com'
  const canonicalUrl = product.canonicalUrl || (slug ? `${siteUrl}/products/${slug}` : undefined)
  if (!canonicalUrl) {
    warnings.push('Missing canonical URL – falling back to document slug if available.')
  }

  const availability = product.availability ? availabilityMap[product.availability] : undefined
  const condition = product.condition ? conditionMap[product.condition] : undefined

  const images = buildImageUrls(product.images, options.imageBuilder)
  if (images.length === 0) {
    warnings.push('Add at least one product image for structured data.')
  }

  if (errors.length > 0) {
    return {json: null, errors, warnings}
  }

  const additionalProperty: Array<Record<string, unknown>> = []
  if (Array.isArray(product.specifications)) {
    for (const spec of product.specifications) {
      if (spec?.label && spec?.value) {
        additionalProperty.push({
          '@type': 'PropertyValue',
          name: spec.label,
          value: spec.value,
        })
      }
    }
  }

  if (Array.isArray(product.keyFeatures)) {
    product.keyFeatures.forEach((feature) => {
      if (feature?.title) {
        additionalProperty.push({
          '@type': 'PropertyValue',
          name: feature.title,
          value: feature.summary || feature.title,
        })
      }
    })
  }

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: description || undefined,
    sku: product.sku,
    mpn: product.mpn,
    gtin13: product.gtin,
    url: canonicalUrl,
    image: images.length ? images : undefined,
    brand: product.brand
      ? {
          '@type': 'Brand',
          name: product.brand,
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency,
      availability,
      itemCondition: condition,
      url: canonicalUrl,
    },
    additionalProperty: additionalProperty.length ? additionalProperty : undefined,
  }

  const overrideText = product.structuredDataOverrides?.trim()
  if (overrideText) {
    try {
      const overrideJson = JSON.parse(overrideText)
      if (overrideJson && typeof overrideJson === 'object') {
        const merged = deepMerge(jsonLd, overrideJson as Record<string, unknown>)
        return {json: merged, errors, warnings}
      }
      warnings.push('structuredDataOverrides must be a JSON object; ignoring value.')
    } catch {
      warnings.push('structuredDataOverrides contains invalid JSON and was ignored.')
    }
  }

  return {json: jsonLd, errors, warnings}
}
