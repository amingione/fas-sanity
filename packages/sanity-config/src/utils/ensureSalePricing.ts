import type {SanityClient} from '@sanity/client'

type ProductForSale = {
  _id: string
  _rev?: string
  onSale?: boolean
  price?: number | null
  salePrice?: number | null
  compareAtPrice?: number | null
  discountPercent?: number | null
  discountInput?: string | null
  discountType?: 'percentage' | 'fixed_amount' | null
  discountValue?: number | null
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
    `*[_id == $productId][0]{_id, _rev, onSale, price, salePrice, compareAtPrice, discountPercent, discountInput, discountType, discountValue}`,
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
  const discountInput = typeof product.discountInput === 'string' ? product.discountInput : undefined
  const discountType =
    product.discountType === 'percentage' || product.discountType === 'fixed_amount'
      ? product.discountType
      : undefined
  const discountValue = toNumber(product.discountValue)

  const originalPrice = compareAt ?? price

  const patch = client.patch(product._id)
  if (product._rev) patch.ifRevisionId(product._rev)

  const setOps: Record<string, unknown> = {}

  let computedSalePrice: number | undefined

  if (onSale && price !== undefined) {
    if (discountType && discountValue !== undefined) {
      const raw =
        discountType === 'percentage'
          ? price - price * (discountValue / 100)
          : price - discountValue
      computedSalePrice = Math.round(raw * 100) / 100
    } else if (discountInput) {
      const percentMatch = discountInput.match(/^\s*(\d+(?:\.\d+)?)%\s*$/)
      const dollarMatch = discountInput.match(/^\s*\$?(\d+(?:\.\d+)?)\s*$/)
      if (percentMatch) {
        const percent = Number(percentMatch[1])
        if (percent > 0 && percent < 100) {
          computedSalePrice = Math.round((price - price * (percent / 100)) * 100) / 100
        }
      } else if (dollarMatch) {
        const amount = Number(dollarMatch[1])
        if (amount > 0 && amount < price) {
          computedSalePrice = Math.round((price - amount) * 100) / 100
        }
      }
    }
  }

  if (computedSalePrice !== undefined && computedSalePrice < 0) {
    computedSalePrice = 0
  }

  const normalizedSalePrice =
    salePrice !== undefined && salePrice < 0 ? 0 : salePrice
  const effectiveSalePrice = computedSalePrice ?? normalizedSalePrice

  if (!onSale || effectiveSalePrice === undefined) {
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

  if (effectiveSalePrice >= originalPrice) {
    log(`Sale price is not less than original for ${product._id}; skipping discount calc.`)
    return {updated: false, skippedReason: 'sale price not less than original'}
  }

  if (computedSalePrice !== undefined) {
    setOps.salePrice = computedSalePrice
  }

  const discount = Math.max(
    0,
    Math.round(((originalPrice - effectiveSalePrice) / originalPrice) * 100),
  )

  setOps.discountPercent = discount
  if (compareAt === undefined && price !== undefined) {
    setOps.compareAtPrice = price
  }

  patch.set(setOps)

  await patch.commit({autoGenerateArrayKeys: true})

  const saleForLog =
    computedSalePrice !== undefined ? computedSalePrice : effectiveSalePrice ?? salePrice
  log(
    `Updated discountPercent for ${product._id} to ${discount}% (salePrice=${saleForLog}, original=${originalPrice}).`,
  )

  return {updated: true, discountPercent: discount}
}
