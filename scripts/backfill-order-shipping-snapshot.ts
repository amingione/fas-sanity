#!/usr/bin/env tsx
import 'dotenv/config'
import {createClient} from '@sanity/client'

type CliOptions = {
  limit: number
  dryRun: boolean
  statuses: string[]
  orderIds: string[]
  includeFallback: boolean
  force: boolean
}

type OrderCartItem = {
  id?: string | null
  quantity?: number | null
  metadata?: Record<string, unknown> | null
  productRefId?: string | null
}

type OrderDoc = {
  _id: string
  orderNumber?: string | null
  status?: string | null
  weight?: Record<string, unknown> | number | string | null
  dimensions?: Record<string, unknown> | null
  cart?: OrderCartItem[] | null
}

type ProductShippingConfig = {
  weight?: number | null
  dimensions?: {
    length?: number | null
    width?: number | null
    height?: number | null
  } | null
  requiresShipping?: boolean | null
}

const DEFAULT_STATUSES = ['paid', 'pending']
const FALLBACK_WEIGHT = 1
const FALLBACK_DIMS = {length: 10, width: 8, height: 4}

const projectId =
  process.env.SANITY_PROJECT_ID ||
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.PUBLIC_SANITY_PROJECT_ID
const dataset =
  process.env.SANITY_DATASET ||
  process.env.SANITY_STUDIO_DATASET ||
  process.env.PUBLIC_SANITY_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN (or SANITY_API_TOKEN).',
  )
  process.exit(1)
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

function parseArgs(): CliOptions {
  const opts: CliOptions = {
    limit: 100,
    dryRun: false,
    statuses: DEFAULT_STATUSES,
    orderIds: [],
    includeFallback: false,
    force: false,
  }

  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i]
    if (!arg) continue
    if (arg === '--limit') {
      const value = process.argv[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit "${value}"`)
      opts.limit = parsed
      i += 1
      continue
    }
    if (arg === '--dry-run' || arg === '--dryRun') {
      opts.dryRun = true
      continue
    }
    if (arg === '--status' || arg === '--statuses') {
      const value = process.argv[i + 1]
      if (!value) throw new Error('Missing value for --status')
      const parsed = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      opts.statuses = parsed.includes('all') ? [] : parsed
      i += 1
      continue
    }
    if (arg === '--order' || arg === '--orders' || arg === '--ids') {
      const value = process.argv[i + 1]
      if (!value) throw new Error('Missing value for --order')
      opts.orderIds = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      i += 1
      continue
    }
    if (arg === '--include-fallback') {
      opts.includeFallback = true
      continue
    }
    if (arg === '--force') {
      opts.force = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: pnpm tsx scripts/backfill-order-shipping-snapshot.ts',
          '  [--limit 100]',
          '  [--dry-run]',
          '  [--status paid,pending | all]',
          '  [--order id1,id2]',
          '  [--include-fallback]',
          '  [--force]',
        ].join(' '),
      )
      process.exit(0)
    }
  }

  return opts
}

function normalizeSanityId(value: string): string {
  return value.startsWith('drafts.') ? value.slice(7) : value
}

function extractProductId(item: OrderCartItem): string | null {
  const metadata =
    item.metadata && typeof item.metadata === 'object'
      ? (item.metadata as Record<string, unknown>)
      : null
  if (metadata && typeof metadata.sanity_product_id === 'string') {
    return metadata.sanity_product_id
  }
  if (typeof item.id === 'string' && item.id.trim()) return item.id.trim()
  if (typeof item.productRefId === 'string' && item.productRefId.trim()) return item.productRefId
  return null
}

function parseWeightField(
  weight: OrderDoc['weight'],
): {value: number | null; unit: string | null} {
  if (typeof weight === 'number') return {value: weight, unit: null}
  if (typeof weight === 'string') {
    const parsed = Number.parseFloat(weight)
    return {value: Number.isFinite(parsed) ? parsed : null, unit: null}
  }
  if (weight && typeof weight === 'object') {
    const rawValue = (weight as any).value ?? (weight as any).weight ?? (weight as any).amount
    const parsed = Number.parseFloat(String(rawValue ?? ''))
    const unit =
      typeof (weight as any).unit === 'string' ? (weight as any).unit.toLowerCase() : null
    return {value: Number.isFinite(parsed) ? parsed : null, unit}
  }
  return {value: null, unit: null}
}

function parseDimensionsField(dimensions: OrderDoc['dimensions']): {
  length?: number
  width?: number
  height?: number
} {
  if (!dimensions || typeof dimensions !== 'object') return {}
  const length =
    typeof (dimensions as any).length === 'number' ? (dimensions as any).length : undefined
  const width = typeof (dimensions as any).width === 'number' ? (dimensions as any).width : undefined
  const height =
    typeof (dimensions as any).height === 'number' ? (dimensions as any).height : undefined
  return {length, width, height}
}

function isFallbackSnapshot(
  weight: OrderDoc['weight'],
  dimensions: OrderDoc['dimensions'],
): boolean {
  const {value, unit} = parseWeightField(weight)
  const dims = parseDimensionsField(dimensions)
  const isWeightFallback = value === FALLBACK_WEIGHT && (!unit || unit === 'pound' || unit === 'lb')
  const isDimsFallback =
    dims.length === FALLBACK_DIMS.length &&
    dims.width === FALLBACK_DIMS.width &&
    dims.height === FALLBACK_DIMS.height
  return isWeightFallback && isDimsFallback
}

async function fetchOrders(options: CliOptions): Promise<OrderDoc[]> {
  const conditions = ['_type == "order"', '!(_id in path("drafts.**"))']
  const params: Record<string, unknown> = {limit: options.limit}

  if (options.statuses.length > 0) {
    conditions.push('status in $statuses')
    params.statuses = options.statuses
  }

  if (options.orderIds.length > 0) {
    const normalized = options.orderIds.map(normalizeSanityId)
    conditions.push('_id in $orderIds')
    params.orderIds = [...normalized, ...normalized.map((id) => `drafts.${id}`)]
  }

  if (!options.includeFallback && !options.force) {
    conditions.push(
      '(!defined(weight) || !defined(weight.value) || !defined(dimensions) || !defined(dimensions.length) || !defined(dimensions.width) || !defined(dimensions.height))',
    )
  }

  const query = `*[${conditions.join(' && ')}] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    status,
    weight,
    dimensions,
    cart[]{
      id,
      quantity,
      metadata,
      "productRefId": productRef._ref
    }
  }`

  return sanity.fetch<OrderDoc[]>(query, params)
}

async function fetchProductShipping(productIds: string[]): Promise<Record<string, ProductShippingConfig>> {
  if (!productIds.length) return {}
  const products = await sanity.fetch<
    Array<{
      _id: string
      weight?: number | null
      dimensions?: {length?: number | null; width?: number | null; height?: number | null} | null
      requiresShipping?: boolean | null
    }>
  >(
    `*[_type == "product" && _id in $productIds]{
      _id,
      "weight": shippingConfig.weight,
      "dimensions": shippingConfig.dimensions,
      "requiresShipping": shippingConfig.requiresShipping
    }`,
    {productIds},
  )

  return products.reduce<Record<string, ProductShippingConfig>>((acc, product) => {
    acc[product._id] = {
      weight: product.weight ?? null,
      dimensions: product.dimensions ?? null,
      requiresShipping: product.requiresShipping ?? null,
    }
    return acc
  }, {})
}

function formatOrderLabel(order: OrderDoc): string {
  return order.orderNumber ? `${order.orderNumber} (${order._id})` : order._id
}

async function main() {
  const options = parseArgs()
  console.log(
    `Backfilling order shipping snapshot (limit=${options.limit}, dryRun=${options.dryRun}, statuses=${options.statuses.length ? options.statuses.join(',') : 'all'})`,
  )

  const orders = await fetchOrders(options)
  if (!orders.length) {
    console.log('No orders matched the backfill criteria.')
    return
  }

  const allProductIds = Array.from(
    new Set(
      orders
        .flatMap((order) => order.cart ?? [])
        .map(extractProductId)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const productShipping = await fetchProductShipping(allProductIds)

  let updated = 0
  let skipped = 0
  let failures = 0

  for (const order of orders) {
    const label = formatOrderLabel(order)
    const cart = order.cart ?? []
    if (!cart.length) {
      console.warn(`Skipping ${label} (missing cart items).`)
      skipped += 1
      continue
    }

    let totalWeightLbs = 0
    let maxLength = 0
    let maxWidth = 0
    let maxHeight = 0
    let hasShippingData = false

    for (const item of cart) {
      const productId = extractProductId(item)
      if (!productId) continue
      const config = productShipping[productId]
      if (!config) continue
      if (config.requiresShipping === false) continue

      const weight = typeof config.weight === 'number' ? config.weight : 0
      const quantity = typeof item.quantity === 'number' ? item.quantity : 1
      if (weight > 0) {
        totalWeightLbs += weight * quantity
        hasShippingData = true
      } else {
        console.warn(`[backfill] Product ${productId} missing shipping weight.`)
      }

      const dims = config.dimensions
      if (dims) {
        const length = typeof dims.length === 'number' ? dims.length : 0
        const width = typeof dims.width === 'number' ? dims.width : 0
        const height = typeof dims.height === 'number' ? dims.height : 0
        if (length > 0 && width > 0 && height > 0) {
          if (length > maxLength) maxLength = length
          if (width > maxWidth) maxWidth = width
          if (height > maxHeight) maxHeight = height
          hasShippingData = true
        }
      } else {
        console.warn(`[backfill] Product ${productId} missing shipping dimensions.`)
      }
    }

    if (!hasShippingData || totalWeightLbs <= 0 || maxLength <= 0 || maxWidth <= 0 || maxHeight <= 0) {
      console.warn(`Skipping ${label} (insufficient shipping data).`)
      skipped += 1
      continue
    }

    const missingWeight = parseWeightField(order.weight).value == null
    const existingDims = parseDimensionsField(order.dimensions)
    const missingDims =
      existingDims.length == null || existingDims.width == null || existingDims.height == null
    const isFallback = isFallbackSnapshot(order.weight, order.dimensions)

    const shouldUpdate =
      options.force || missingWeight || missingDims || (options.includeFallback && isFallback)

    if (!shouldUpdate) {
      skipped += 1
      continue
    }

    const payload = {
      weight: {value: Number(totalWeightLbs.toFixed(2)), unit: 'pound'},
      dimensions: {
        length: Number(maxLength.toFixed(2)),
        width: Number(maxWidth.toFixed(2)),
        height: Number(maxHeight.toFixed(2)),
      },
    }

    if (options.dryRun) {
      console.log(`[dry-run] Would update ${label} ->`, payload)
      updated += 1
      continue
    }

    try {
      await sanity.patch(order._id).set(payload).commit({autoGenerateArrayKeys: true})
      updated += 1
      console.log(`✅ Updated ${label}`)
    } catch (err) {
      failures += 1
      console.error(`❌ Failed ${label}`, err)
    }
  }

  console.log(`Backfill complete. updated=${updated}, skipped=${skipped}, failures=${failures}`)
}

main().catch((err) => {
  console.error('Backfill failed', err)
  process.exit(1)
})
