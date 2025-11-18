import type {PortableTextBlock} from '@portabletext/types'

export type MerchantCenterProduct = {
  _id: string
  title?: string
  slug?: string
  description?: PortableTextBlock[]
  shortDescription?: PortableTextBlock[]
  price?: number
  salePrice?: number
  availability?: string
  googleProductCategory?: string
  mpn?: string
  gtin?: string
  productType?: string
  imageUrl?: string
  canonicalUrl?: string
}

const SERVICE_TYPES = new Set(['service'])

export const isServiceProduct = (product?: MerchantCenterProduct | null): boolean => {
  if (!product) return false
  const type = (product.productType || '').toLowerCase()
  return SERVICE_TYPES.has(type)
}

export const portableTextToPlain = (blocks?: PortableTextBlock[]): string => {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children
        .map((child) => (typeof child?.text === 'string' ? child.text : ''))
        .join('')
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export const buildProductUrl = (product: MerchantCenterProduct): string => {
  if (product.canonicalUrl) return product.canonicalUrl
  if (product.slug) return `https://fasmotorsports.com/products/${product.slug}`
  return 'https://fasmotorsports.com'
}

export const getMerchantFeedIssues = (product: MerchantCenterProduct): string[] => {
  if (isServiceProduct(product)) return []
  const missing: string[] = []
  const description =
    portableTextToPlain(product.description) || portableTextToPlain(product.shortDescription)
  if (!product.title) missing.push('Title')
  if (!description) missing.push('Description')
  if (typeof product.price !== 'number') missing.push('Price')
  if (!product.imageUrl) missing.push('Image')
  if (!product.googleProductCategory) missing.push('Google Category')
  if (!product.availability) missing.push('Availability')
  if (!product.mpn) missing.push('MPN')
  if (!product.gtin) missing.push('GTIN')
  return missing
}

export const getMerchantCoreWarnings = (product: MerchantCenterProduct): string[] => {
  if (isServiceProduct(product)) return []
  const warnings: string[] = []
  if (!product.gtin) warnings.push('GTIN')
  if (!product.mpn) warnings.push('MPN')
  if (!product.googleProductCategory) warnings.push('Google Category')
  return warnings
}

export const isMerchantReady = (product: MerchantCenterProduct): boolean => {
  return getMerchantFeedIssues(product).length === 0
}
