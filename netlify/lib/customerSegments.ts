const ORDER_TOTAL_EXPRESSION =
  'coalesce(totalAmount, amountSubtotal - coalesce(amountDiscount, 0) + amountTax + amountShipping, amountSubtotal + amountTax - coalesce(amountDiscount, 0), amountSubtotal, totalAmount, total, 0)'

export const CUSTOMER_METRICS_QUERY = `*[_type == "customer" && !(_id in path("drafts.**")) && (!defined($customerId) || _id == $customerId)][0...$limit]{
  _id,
  "lifetimeValue": coalesce(sum(*[_type == "order" && status == "paid" && customerRef._ref == ^._id].${ORDER_TOTAL_EXPRESSION}), 0),
  "totalOrders": count(*[_type == "order" && customerRef._ref == ^._id]),
  "lastOrderDate": *[_type == "order" && customerRef._ref == ^._id] | order(dateTime(coalesce(orderDate, createdAt, _createdAt)) desc)[0]{
    "ts": coalesce(orderDate, createdAt, _createdAt)
  }.ts,
  "firstOrderDate": *[_type == "order" && customerRef._ref == ^._id] | order(dateTime(coalesce(orderDate, createdAt, _createdAt)) asc)[0]{
    "ts": coalesce(orderDate, createdAt, _createdAt)
  }.ts,
  "current": {
    "segment": segment,
    "lifetimeValue": lifetimeValue,
    "totalOrders": totalOrders,
    "averageOrderValue": averageOrderValue,
    "lastOrderDate": lastOrderDate,
    "firstOrderDate": firstOrderDate,
    "daysSinceLastOrder": daysSinceLastOrder
  }
}`

export type CustomerSegmentValue =
  | 'vip'
  | 'repeat'
  | 'new'
  | 'at_risk'
  | 'inactive'
  | 'active'

export type CustomerMetricsSource = {
  _id: string
  lifetimeValue?: number | null
  totalOrders?: number | null
  lastOrderDate?: string | null
  firstOrderDate?: string | null
  current?: {
    segment?: CustomerSegmentValue | null
    lifetimeValue?: number | null
    totalOrders?: number | null
    averageOrderValue?: number | null
    lastOrderDate?: string | null
    firstOrderDate?: string | null
    daysSinceLastOrder?: number | null
  }
}

export type CustomerMetricPatch = {
  lifetimeValue: number
  totalOrders: number
  averageOrderValue: number
  lastOrderDate?: string | null
  firstOrderDate?: string | null
  daysSinceLastOrder?: number | null
  segment: CustomerSegmentValue
}

const MS_PER_DAY = 86_400_000
const METRIC_FIELDS: Array<keyof CustomerMetricPatch> = [
  'segment',
  'lifetimeValue',
  'totalOrders',
  'averageOrderValue',
  'lastOrderDate',
  'firstOrderDate',
  'daysSinceLastOrder',
]

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function determineCustomerSegment(
  metrics: Pick<CustomerMetricPatch, 'lifetimeValue' | 'totalOrders' | 'daysSinceLastOrder' | 'firstOrderDate'>,
  now = new Date(),
): CustomerSegmentValue {
  const {lifetimeValue, totalOrders, daysSinceLastOrder, firstOrderDate} = metrics
  if (lifetimeValue > 10_000) return 'vip'
  if (totalOrders >= 3) return 'repeat'
  const firstOrder = parseDate(firstOrderDate)
  if (firstOrder) {
    const daysSinceFirst = Math.floor((now.getTime() - firstOrder.getTime()) / MS_PER_DAY)
    if (daysSinceFirst <= 30) return 'new'
  }
  if (typeof daysSinceLastOrder === 'number') {
    if (daysSinceLastOrder > 365) return 'inactive'
    if (daysSinceLastOrder > 180) return 'at_risk'
  }
  return 'active'
}

export function buildCustomerMetricsPatch(
  source: CustomerMetricsSource,
  now = new Date(),
): CustomerMetricPatch {
  const lifetimeValue = isFiniteNumber(source.lifetimeValue) ? source.lifetimeValue : 0
  const totalOrders = isFiniteNumber(source.totalOrders) ? source.totalOrders : 0
  const lastOrderDate = source.lastOrderDate || null
  const firstOrderDate = source.firstOrderDate || null

  const lastOrder = parseDate(lastOrderDate)
  const daysSinceLastOrder = lastOrder
    ? Math.max(0, Math.floor((now.getTime() - lastOrder.getTime()) / MS_PER_DAY))
    : null

  const averageOrderValue =
    totalOrders > 0 ? Number((lifetimeValue / totalOrders).toFixed(2)) : 0

  const segment = determineCustomerSegment(
    {
      lifetimeValue,
      totalOrders,
      daysSinceLastOrder,
      firstOrderDate,
    },
    now,
  )

  return {
    lifetimeValue,
    totalOrders,
    averageOrderValue,
    lastOrderDate,
    firstOrderDate,
    daysSinceLastOrder,
    segment,
  }
}

const normalizeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null

export function metricsChanged(
  desired: CustomerMetricPatch,
  current?: CustomerMetricsSource['current'],
): boolean {
  for (const field of METRIC_FIELDS) {
    const expected = desired[field] ?? null
    const existing = current?.[field] ?? null
    if (typeof expected === 'number') {
      if (normalizeNumber(expected) !== normalizeNumber(existing)) return true
      continue
    }
    if (expected !== existing) return true
  }
  return false
}
