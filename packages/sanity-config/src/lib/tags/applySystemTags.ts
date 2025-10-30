export type OrderLike = {
  paymentStatus?: string | null
  amountPaid?: number | null
  amountRefunded?: number | null
  status?: string | null
  systemTags?: unknown
  shipments?: Array<{labelStatus?: string | null; trackingNumber?: string | null}> | null
  customer?: {orderCount?: number | null} | null
  customerRef?: {orderCount?: number | null} | null
}

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : '').trim()

const toShipments = (
  order: OrderLike,
): Array<{labelStatus?: string | null; trackingNumber?: string | null}> => {
  if (Array.isArray(order.shipments)) {
    return order.shipments.filter((item): item is {labelStatus?: string | null; trackingNumber?: string | null} =>
      item !== null && typeof item === 'object',
    )
  }

  return []
}

const getSystemTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : []

const getOrderCount = (order: OrderLike): number => {
  const fromCustomer = order.customer?.orderCount
  const fromRef = order.customerRef?.orderCount
  if (typeof fromCustomer === 'number') return fromCustomer
  if (typeof fromRef === 'number') return fromRef
  return 0
}

export function computeSystemTags(order: OrderLike): string[] {
  const tags = new Set<string>()
  const paymentStatus = normalizeString(order.paymentStatus)
  const status = normalizeString(order.status)
  const existingTags = getSystemTags(order.systemTags)
  existingTags.forEach((tag) => tags.add(tag))

  if (paymentStatus === 'paid') {
    tags.add('Paid')
  }

  const amountPaid = typeof order.amountPaid === 'number' ? order.amountPaid : 0
  const amountRefunded = typeof order.amountRefunded === 'number' ? order.amountRefunded : 0
  if (amountPaid > amountRefunded && (status === 'canceled' || existingTags.includes('Return pending'))) {
    tags.add('Refund owed')
  }

  const shipments = toShipments(order)
  if (shipments.some((shipment) => normalizeString(shipment.labelStatus) === 'purchased')) {
    tags.add('Shipping label purchased')
  }

  if (shipments.some((shipment) => normalizeString(shipment.trackingNumber).length > 0)) {
    tags.add('Tracking added')
  }

  if (getOrderCount(order) === 1) {
    tags.add('First order')
  }

  return Array.from(tags)
}
