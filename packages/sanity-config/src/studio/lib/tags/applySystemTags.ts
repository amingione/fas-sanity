export type ShipmentLike = {
  labelStatus?: string | null
  trackingNumber?: string | null
}

export type CustomerOrderStatsLike = {
  orderCount?: number | null
  totalCount?: number | null
  totalOrders?: number | null
}

export type CustomerLike = {
  orderCount?: number | null
  totalOrderCount?: number | null
  totalOrders?: number | null
  stats?: CustomerOrderStatsLike | null
  metrics?: CustomerOrderStatsLike | null
  orders?: Array<unknown> | CustomerOrderStatsLike | null
}

export type OrderLike = {
  paymentStatus?: string | null
  amountPaid?: number | null
  amountRefunded?: number | null
  status?: string | null
  systemTags?: Array<unknown> | null
  shipments?: Array<ShipmentLike | null | undefined> | null
  customer?: CustomerLike | null
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const normalizeTag = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const candidate = record.title || record.name || record.label || record.value
    return typeof candidate === 'string' ? candidate : null
  }
  return null
}

const collectTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return []
  return tags
    .map(normalizeTag)
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
}

const hasReturnPendingTag = (tags: string[]) =>
  tags.some((tag) => tag.localeCompare('Return pending', undefined, {sensitivity: 'accent'}) === 0)

const extractOrderCount = (customer: CustomerLike | null | undefined): number | null => {
  if (!customer) return null

  const candidates: Array<unknown> = [
    customer.totalOrderCount,
    customer.orderCount,
    customer.totalOrders,
    customer?.stats?.totalCount,
    customer?.stats?.orderCount,
    customer?.stats?.totalOrders,
    customer?.metrics?.totalCount,
    customer?.metrics?.orderCount,
    customer?.metrics?.totalOrders,
  ]

  if (Array.isArray(customer.orders)) {
    candidates.push(customer.orders.length)
  } else if (customer.orders && typeof customer.orders === 'object') {
    const record = customer.orders as CustomerOrderStatsLike
    candidates.push(record.totalCount, record.orderCount, record.totalOrders)
  }

  for (const candidate of candidates) {
    const numeric = toNumber(candidate)
    if (numeric !== null) {
      return numeric
    }
  }

  return null
}

const addTag = (tags: string[], tag: string) => {
  if (!tags.includes(tag)) {
    tags.push(tag)
  }
}

export function computeSystemTags(order: OrderLike | null | undefined): string[] {
  if (!order) return []

  const computed: string[] = []
  const existingSystemTags = collectTags(order.systemTags)

  if (order.paymentStatus === 'paid') {
    addTag(computed, 'Paid')
  }

  const amountPaid = toNumber(order.amountPaid)
  const amountRefunded = toNumber(order.amountRefunded)
  const returnPending = hasReturnPendingTag(existingSystemTags)
  const status = order.status || ''

  if (
    amountPaid !== null &&
    amountRefunded !== null &&
    amountPaid > amountRefunded &&
    (status === 'canceled' || returnPending)
  ) {
    addTag(computed, 'Refund owed')
  }

  const shipments = Array.isArray(order.shipments) ? order.shipments : []
  const hasPurchasedLabel = shipments.some((shipment) => shipment?.labelStatus === 'purchased')
  if (hasPurchasedLabel) {
    addTag(computed, 'Shipping label purchased')
  }

  const hasTracking = shipments.some((shipment) => {
    const tracking = shipment?.trackingNumber
    return typeof tracking === 'string' && tracking.trim().length > 0
  })
  if (hasTracking) {
    addTag(computed, 'Tracking added')
  }

  const orderCount = extractOrderCount(order.customer)
  if (orderCount === 1) {
    addTag(computed, 'First order')
  }

  return computed
}
