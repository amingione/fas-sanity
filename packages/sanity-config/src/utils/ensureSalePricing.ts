import type {SanityClient} from '@sanity/client'

type ProductForSale = {
  _id: string
  _rev?: string
  onSale?: boolean
  price?: number | null
  salePrice?: number | null
  compareAtPrice?: number | null
  discountPercent?: number | null
}

export type EnsureSalePricingResult = {
  updated: boolean
  discountPercent?: number | null
  skippedReason?: string
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export async function ensureSalePricing(
  productId: string,
  client: SanityClient,
  options?: {log?: (...args: unknown[]) => void},
): Promise<EnsureSalePricingResult> {
  const log = options?.log || ((...args: unknown[]) => console.log('[sale-pricing]', ...args))

  const product = await client.fetch<ProductForSale>(
    `*[_id == $productId][0]{_id, _rev, onSale, price, salePrice, compareAtPrice, discountPercent}`,
    {productId},
  )

  if (!product) {
    log(`No product found for id ${productId}; skipping sale discount calculation.`)
    return {updated: false, skippedReason: 'missing product'}
  }

  const onSale = Boolean(product.onSale)
  const salePrice = toNumber(product.salePrice)
  const price = toNumber(product.price)
  const compareAt = toNumber(product.compareAtPrice)

  const originalPrice = compareAt ?? price

  const patch = client.patch(product._id)
  if (product._rev) patch.ifRevisionId(product._rev)

  if (!onSale || salePrice === undefined) {
    if (product.discountPercent !== null && product.discountPercent !== undefined) {
      patch.unset(['discountPercent'])
      await patch.commit({autoGenerateArrayKeys: true})
      log(`Cleared discountPercent for ${product._id} because sale is inactive.`)
      return {updated: true, discountPercent: null}
    }
    return {updated: false, skippedReason: 'not on sale or missing salePrice'}
  }

  if (originalPrice === undefined || originalPrice <= 0) {
    log(`Missing or invalid original price for ${product._id}; skipping discount calc.`)
    return {updated: false, skippedReason: 'missing original price'}
  }

  if (salePrice >= originalPrice) {
    log(`Sale price is not less than original for ${product._id}; skipping discount calc.`)
    return {updated: false, skippedReason: 'sale price not less than original'}
  }

  const discount = Math.max(0, Math.round(((originalPrice - salePrice) / originalPrice) * 100))

  const setOps: Record<string, unknown> = {discountPercent: discount}
  if (compareAt === undefined && price !== undefined) {
    setOps.compareAtPrice = price
  }

  patch.set(setOps)

  await patch.commit({autoGenerateArrayKeys: true})

  log(
    `Updated discountPercent for ${product._id} to ${discount}% (salePrice=${salePrice}, original=${originalPrice}).`,
  )

  return {updated: true, discountPercent: discount}
}
