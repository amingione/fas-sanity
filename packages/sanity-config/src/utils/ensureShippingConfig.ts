import type {SanityClient} from '@sanity/client'

type Dimensions = {
  length: number
  width: number
  height: number
}

type ShippingConfig = {
  requiresShipping?: boolean
  weight?: number
  dimensions?: Dimensions
  shippingClass?: string
  handlingTime?: number
  freeShippingEligible?: boolean
  separateShipment?: boolean
  callForShippingQuote?: boolean
}

type ProductForShipping = {
  _id: string
  _rev?: string
  productType?: string
  shippingConfig?: ShippingConfig | null
  shippingWeight?: number | null
  boxDimensions?: string | null
  shippingClass?: string | null
  handlingTime?: number | null
  shipsAlone?: boolean | null
}

export type EnsureShippingConfigResult = {
  updated: boolean
  shippingConfig?: ShippingConfig
  skippedReason?: string
}

const DIM_REGEX = /^\s*(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*(\d+(?:\.\d+)?)\s*$/

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseDimensions(value?: string | null): Dimensions | undefined {
  if (!value) return undefined
  const match = value.match(DIM_REGEX)
  if (!match) return undefined
  const [length, width, height] = match.slice(1).map((num) => Number(num))
  if ([length, width, height].some((num) => Number.isNaN(num))) return undefined
  return {length, width, height}
}

function normalizedProductType(type?: string | null) {
  return (type || '').toLowerCase()
}

function shippingConfigChanged(prev: ShippingConfig | null | undefined, next: ShippingConfig) {
  const prevDims = prev?.dimensions
  const nextDims = next.dimensions
  const dimsChanged =
    (prevDims?.length ?? null) !== (nextDims?.length ?? null) ||
    (prevDims?.width ?? null) !== (nextDims?.width ?? null) ||
    (prevDims?.height ?? null) !== (nextDims?.height ?? null)

  return (
    (prev?.requiresShipping ?? null) !== (next.requiresShipping ?? null) ||
    (prev?.weight ?? null) !== (next.weight ?? null) ||
    dimsChanged ||
    (prev?.shippingClass ?? null) !== (next.shippingClass ?? null) ||
    (prev?.handlingTime ?? null) !== (next.handlingTime ?? null) ||
    (prev?.separateShipment ?? null) !== (next.separateShipment ?? null) ||
    (prev?.callForShippingQuote ?? null) !== (next.callForShippingQuote ?? null)
  )
}

export async function ensureShippingConfig(
  productId: string,
  client: SanityClient,
  options?: {log?: (...args: unknown[]) => void},
): Promise<EnsureShippingConfigResult> {
  const log = options?.log || ((...args: unknown[]) => console.log('[shipping-config]', ...args))

  const product = await client.fetch<ProductForShipping>(
    `*[_id == $productId][0]{
      _id,
      _rev,
      productType,
      shippingConfig,
      shippingWeight,
      boxDimensions,
      shippingClass,
      handlingTime,
      shipsAlone
    }`,
    {productId},
  )

  if (!product) {
    log(`No product found for id ${productId}; skipping shippingConfig generation.`)
    return {updated: false, skippedReason: 'missing product'}
  }

  const existing = product.shippingConfig || {}

  const requiresShipping =
    existing.requiresShipping ??
    (normalizedProductType(product.productType) === 'service' ? false : true)
  const weight = existing.weight ?? toNumber(product.shippingWeight)
  const dimensions = existing.dimensions ?? parseDimensions(product.boxDimensions)
  const shippingClass =
    existing.shippingClass ?? (typeof product.shippingClass === 'string' ? product.shippingClass : undefined)
  const handlingTime = existing.handlingTime ?? toNumber(product.handlingTime)
  const separateShipment =
    existing.separateShipment ??
    (typeof product.shipsAlone === 'boolean' ? product.shipsAlone : undefined)

  const nextConfig: ShippingConfig = {...existing}
  if (requiresShipping !== undefined) nextConfig.requiresShipping = requiresShipping
  if (typeof weight === 'number') nextConfig.weight = weight
  if (dimensions) nextConfig.dimensions = dimensions
  if (typeof shippingClass === 'string' && shippingClass) nextConfig.shippingClass = shippingClass
  if (typeof handlingTime === 'number') nextConfig.handlingTime = handlingTime
  if (typeof separateShipment === 'boolean') nextConfig.separateShipment = separateShipment

  const shouldUpdate = shippingConfigChanged(product.shippingConfig, nextConfig)

  const shouldMirrorWeight =
    typeof weight === 'number' &&
    !(typeof product.shippingWeight === 'number' && Number.isFinite(product.shippingWeight))

  if (!shouldUpdate && !shouldMirrorWeight) {
    log(`Shipping config already up to date for ${product._id}; skipping.`)
    return {updated: false, shippingConfig: product.shippingConfig ?? nextConfig}
  }

  const patch = client.patch(product._id)
  if (product._rev) patch.ifRevisionId(product._rev)

  patch.set({shippingConfig: nextConfig})
  if (shouldMirrorWeight) patch.setIfMissing({shippingWeight: weight})

  await patch.commit({autoGenerateArrayKeys: true})

  log(
    `Updated shippingConfig for ${product._id} with weight=${weight ?? 'n/a'} dims=${
      dimensions ? `${dimensions.length}x${dimensions.width}x${dimensions.height}` : 'n/a'
    } shippingClass=${shippingClass ?? 'n/a'} handlingTime=${handlingTime ?? 'n/a'} separateShipment=${
      separateShipment ?? 'n/a'
    }.`,
  )

  return {updated: true, shippingConfig: nextConfig}
}
