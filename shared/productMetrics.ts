import type {SanityClient} from '@sanity/client'

type ProductDoc = {
  _id: string
  title?: string | null
  sku?: string | null
  price?: number | null
  manufacturingCost?: number | null
}

type OrderLine = {
  name?: string | null
  sku?: string | null
  quantity?: number | null
  lineTotal?: number | null
  price?: number | null
  basePrice?: number | null
  productRef?: {_ref?: string | null} | null
  product?: ProductDoc | null
}

type OrderDoc = {
  cart?: Array<OrderLine | null> | null
}

type InventoryTransaction = {
  productRef?: {_ref?: string | null} | null
  product?: {_id?: string | null} | null
  quantity?: number | null
  unitCost?: number | null
}

export type ProductMetricRow = {
  id: string
  title?: string | null
  sku?: string | null
  price?: number | null
  manufacturingCost?: number | null
  unitsSold: number
  revenue: number
  cogs: number
}

export type ProductMetricsResult = {
  products: ProductMetricRow[]
  totals: {unitsSold: number; revenue: number; cogs: number}
}

const PRODUCT_QUERY = `
*[_type == "product" && !(_id in path("drafts.**"))]{
  _id,
  title,
  sku,
  price,
  manufacturingCost
}
`

const ORDER_LINES_QUERY = `
*[
  _type == "order" &&
  !(_id in path("drafts.**")) &&
  status == "paid"
]{
  cart[]{
    name,
    sku,
    quantity,
    lineTotal,
    price,
    basePrice,
    "productRef": productRef,
    "product": productRef->{_id, title, sku, price, manufacturingCost}
  }
}
`

const SOLD_TRANSACTIONS_QUERY = `
*[_type == "inventoryTransaction" && type == "sold"]{
  "productRef": product,
  "product": product->{_id},
  quantity,
  unitCost
}
`

const toNumber = (value: unknown): number => {
  const num = typeof value === 'string' ? Number(value) : (value as number)
  return Number.isFinite(num) ? num : 0
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100

const getProductId = (
  source:
    | {productRef?: {_ref?: string | null} | null; product?: {_id?: string | null} | null}
    | null
    | undefined,
): string | null => {
  return source?.productRef?._ref || source?.product?._id || null
}

const ensureMetric = (
  metrics: Map<string, ProductMetricRow>,
  productId: string,
  product?: ProductDoc | null,
  fallback?: {name?: string | null; sku?: string | null},
): ProductMetricRow => {
  const existing = metrics.get(productId)
  if (existing) return existing
  const created: ProductMetricRow = {
    id: productId,
    title: product?.title || fallback?.name || null,
    sku: product?.sku || fallback?.sku || null,
    price: product?.price ?? null,
    manufacturingCost: product?.manufacturingCost ?? null,
    unitsSold: 0,
    revenue: 0,
    cogs: 0,
  }
  metrics.set(productId, created)
  return created
}

export async function computeProductMetrics(client: SanityClient): Promise<ProductMetricsResult> {
  const [products, orders, transactions] = await Promise.all([
    client.fetch<ProductDoc[]>(PRODUCT_QUERY),
    client.fetch<OrderDoc[]>(ORDER_LINES_QUERY),
    client.fetch<InventoryTransaction[]>(SOLD_TRANSACTIONS_QUERY),
  ])

  const metrics = new Map<string, ProductMetricRow>()

  // Seed metrics with known products for consistent ordering and metadata.
  for (const product of products || []) {
    if (!product?._id) continue
    metrics.set(product._id, {
      id: product._id,
      title: product.title || null,
      sku: product.sku || null,
      price: product.price ?? null,
      manufacturingCost: product.manufacturingCost ?? null,
      unitsSold: 0,
      revenue: 0,
      cogs: 0,
    })
  }

  for (const order of orders || []) {
    if (!Array.isArray(order?.cart)) continue
    for (const line of order.cart) {
      if (!line) continue
      const productId = getProductId(line)
      if (!productId) continue
      const qty = Math.max(0, toNumber(line.quantity))
      if (!qty) continue
      const revenue =
        toNumber(line.lineTotal) ||
        qty * (toNumber(line.price) || toNumber(line.basePrice) || toNumber(line.product?.price))
      const metric = ensureMetric(metrics, productId, line.product, {name: line.name, sku: line.sku})
      metric.unitsSold += qty
      metric.revenue += revenue
    }
  }

  for (const txn of transactions || []) {
    const productId = getProductId(txn)
    if (!productId) continue
    const qty = Math.max(0, toNumber(txn.quantity))
    const unitCost = toNumber(txn.unitCost)
    if (!qty || !unitCost) continue
    const metric = ensureMetric(metrics, productId)
    metric.cogs += qty * unitCost
  }

  const productsWithTotals: ProductMetricRow[] = []

  for (const metric of metrics.values()) {
    if (!metric.cogs && metric.unitsSold > 0) {
      const fallbackCost = toNumber(metric.manufacturingCost)
      if (fallbackCost > 0) {
        metric.cogs = fallbackCost * metric.unitsSold
      }
    }
    metric.revenue = roundCurrency(metric.revenue)
    metric.cogs = roundCurrency(metric.cogs)
    productsWithTotals.push(metric)
  }

  productsWithTotals.sort((a, b) => {
    const revenueDiff = (b.revenue || 0) - (a.revenue || 0)
    if (revenueDiff !== 0) return revenueDiff
    return (a.title || '').localeCompare(b.title || '')
  })

  const totals = productsWithTotals.reduce(
    (acc, row) => {
      acc.unitsSold += row.unitsSold
      acc.revenue += row.revenue
      acc.cogs += row.cogs
      return acc
    },
    {unitsSold: 0, revenue: 0, cogs: 0},
  )

  totals.revenue = roundCurrency(totals.revenue)
  totals.cogs = roundCurrency(totals.cogs)

  return {
    products: productsWithTotals,
    totals,
  }
}
