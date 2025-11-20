export type VendorPricingTier = 'standard' | 'preferred' | 'platinum' | 'custom'

export type VendorProductPricing = {
  price?: number | null
  wholesalePriceStandard?: number | null
  wholesalePricePreferred?: number | null
  wholesalePricePlatinum?: number | null
  pricingTiers?: Array<{label?: string | null; price?: number | null}>
}

export type VendorQuoteItemInput = {
  product?: VendorProductPricing | null
  quantity?: number | null
  tier?: VendorPricingTier | null
  customDiscountPercentage?: number | null
  unitPrice?: number | null
}

export type VendorQuoteTotalsInput = {
  items: VendorQuoteItemInput[]
  shipping?: number | null
  taxRate?: number | null
}

export type VendorQuoteTotals = {
  subtotal: number
  tax: number
  shipping: number
  total: number
}

export const DEFAULT_VENDOR_DISCOUNTS: Record<Exclude<VendorPricingTier, 'custom'>, number> = {
  standard: 20,
  preferred: 30,
  platinum: 40,
}

const percentToMultiplier = (percent?: number | null): number => {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 1
  return Math.max(0, 1 - percent / 100)
}

const roundCurrency = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

const coerceNumber = (value?: number | null): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

const matchPricingTierEntry = (
  product: VendorProductPricing | undefined | null,
  tier: VendorPricingTier,
): number | undefined => {
  if (!product?.pricingTiers?.length) return undefined
  const normalizedTier = tier.toLowerCase()
  for (const entry of product.pricingTiers) {
    if (!entry) continue
    const label = (entry.label || '').toLowerCase()
    if (label === normalizedTier) {
      return coerceNumber(entry.price)
    }
  }
  return undefined
}

export function resolveVendorUnitPrice(
  product: VendorProductPricing | undefined | null,
  tier: VendorPricingTier,
  customDiscountPercentage?: number | null,
): number {
  const basePrice = coerceNumber(product?.price) ?? 0
  const tierEntryPrice = matchPricingTierEntry(product, tier)
  if (typeof tierEntryPrice === 'number') {
    return roundCurrency(tierEntryPrice)
  }

  switch (tier) {
    case 'standard':
      if (typeof product?.wholesalePriceStandard === 'number') {
        return roundCurrency(product.wholesalePriceStandard)
      }
      return roundCurrency(basePrice * percentToMultiplier(DEFAULT_VENDOR_DISCOUNTS.standard))
    case 'preferred':
      if (typeof product?.wholesalePricePreferred === 'number') {
        return roundCurrency(product.wholesalePricePreferred)
      }
      return roundCurrency(basePrice * percentToMultiplier(DEFAULT_VENDOR_DISCOUNTS.preferred))
    case 'platinum':
      if (typeof product?.wholesalePricePlatinum === 'number') {
        return roundCurrency(product.wholesalePricePlatinum)
      }
      return roundCurrency(basePrice * percentToMultiplier(DEFAULT_VENDOR_DISCOUNTS.platinum))
    case 'custom': {
      const multiplier = percentToMultiplier(customDiscountPercentage)
      return roundCurrency(basePrice * multiplier)
    }
    default:
      return roundCurrency(basePrice)
  }
}

export function calculateVendorItemSubtotal(
  input: VendorQuoteItemInput,
  fallbackTier: VendorPricingTier = 'standard',
  customDiscountPercentage?: number | null,
): {unitPrice: number; subtotal: number; quantity: number} {
  const quantity = typeof input.quantity === 'number' && Number.isFinite(input.quantity) ? input.quantity : 0
  const tier = input.tier ?? fallbackTier
  const unitPrice =
    typeof input.unitPrice === 'number' && Number.isFinite(input.unitPrice)
      ? roundCurrency(input.unitPrice)
      : resolveVendorUnitPrice(
          input.product || null,
          tier,
          typeof customDiscountPercentage === 'number' ? customDiscountPercentage : input.customDiscountPercentage,
        )
  const subtotal = roundCurrency(unitPrice * Math.max(quantity, 0))
  return {unitPrice, subtotal, quantity: Math.max(quantity, 0)}
}

export function calculateVendorQuoteTotals({
  items,
  shipping,
  taxRate,
}: VendorQuoteTotalsInput): VendorQuoteTotals {
  const safeShipping =
    typeof shipping === 'number' && Number.isFinite(shipping) ? Math.max(shipping, 0) : 0
  const subtotal = roundCurrency(
    items.reduce((sum, item) => {
      const {subtotal: lineSubtotal} = calculateVendorItemSubtotal(item)
      return sum + lineSubtotal
    }, 0),
  )
  const safeTaxRate =
    typeof taxRate === 'number' && Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0
  const tax = roundCurrency(subtotal * safeTaxRate)
  const total = roundCurrency(subtotal + tax + safeShipping)
  return {
    subtotal,
    tax,
    shipping: safeShipping,
    total,
  }
}
