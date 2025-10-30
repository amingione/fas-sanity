import type {SanityClient} from 'sanity'

type SanityClientLike = Pick<SanityClient, 'fetch'>

export type OrderListItem = {
  _id: string
  _type: 'order'
  orderNumber?: number | null
  status?: string | null
  paymentStatus?: string | null
  fulfillmentStatus?: string | null
  archivedAt?: string | null
  canceledAt?: string | null
  total?: number | null
  subtotal?: number | null
  shippingAmount?: number | null
  taxAmount?: number | null
  discountAmount?: number | null
  amountPaid?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
  shippingSelection?: {
    selectedRateId?: string | null
    carrier?: string | null
    service?: string | null
    deliveryDays?: number | null
    rateAmount?: number | null
    currency?: string | null
  } | null
  customerName?: string | null
  customerRef?: {firstName?: string | null; lastName?: string | null} | null
  lineItemCount?: number | null
  systemTags?: string[] | null
  tags?: Array<{_id: string; name?: string | null; color?: string | null}> | null
}

export type OrdersFacetCounts = {
  current: number
  all: number
  unfulfilled: number
  unpaid: number
  open: number
  archived: number
}

export type OrdersListResult = {
  items: OrderListItem[]
  counts: OrdersFacetCounts
}

export type CheckoutListItem = {
  _id: string
  _type: 'checkout'
  status?: string | null
  customerName?: string | null
  customerEmail?: string | null
  total?: number | null
  currency?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  lineItemCount?: number | null
}

export type CheckoutListResult = {
  items: CheckoutListItem[]
  counts: {total: number}
}

export type OrderFilterParams = {
  dateFrom?: string
  dateTo?: string
  status?: string[]
  paymentStatus?: string[]
  fulfillmentStatus?: string[]
  tagAny?: string[]
  tagAll?: string[]
  archived?: boolean
  search?: string
  isInvoice?: boolean
  isQuote?: boolean
  limit?: number
  offset?: number
  sort?: 'createdAtDesc' | 'totalDesc' | 'orderNumberDesc'
}

const ORDER_BASE_FILTER = '_type == "order"'
const ORDER_PROJECTION = `{
  _id,
  _type,
  orderNumber,
  status,
  paymentStatus,
  fulfillmentStatus,
  archivedAt,
  canceledAt,
  total,
  subtotal,
  shippingAmount,
  taxAmount,
  discountAmount,
  amountPaid,
  amountRefunded,
  currency,
  createdAt,
  shippingSelection,
  customerName,
  customerRef->{firstName, lastName},
  lineItemCount: coalesce(count(lineItems), count(cart)),
  systemTags,
  tags[]->{_id, name, color}
}`

const CHECKOUT_PROJECTION = `{
  _id,
  _type,
  status,
  customerName,
  customerEmail,
  total,
  currency,
  createdAt,
  updatedAt,
  lineItemCount: coalesce(count(lineItems), count(cart))
}`

const SORT_MAP: Record<NonNullable<OrderFilterParams['sort']>, string> = {
  createdAtDesc: 'createdAt desc',
  totalDesc: 'total desc',
  orderNumberDesc: 'orderNumber desc',
}

const clampLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 200
  return Math.max(0, Math.min(Math.floor(limit), 500))
}

const clampOffset = (offset?: number): number => {
  if (typeof offset !== 'number' || Number.isNaN(offset)) return 0
  return Math.max(0, Math.floor(offset))
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildCountsProjection = (filter: string): string => `{
  "current": count(*[${filter}]),
  "all": count(*[${ORDER_BASE_FILTER}]),
  "unfulfilled": count(*[${ORDER_BASE_FILTER} && fulfillmentStatus == "unfulfilled" && !defined(archivedAt)]),
  "unpaid": count(*[${ORDER_BASE_FILTER} && paymentStatus in ["unpaid", "pending", "authorized"] && !defined(archivedAt)]),
  "open": count(*[${ORDER_BASE_FILTER} && status == "open" && !defined(archivedAt)]),
  "archived": count(*[${ORDER_BASE_FILTER} && defined(archivedAt)])
}`

const buildFilter = (additional?: string): string =>
  additional && additional.trim().length > 0
    ? `${ORDER_BASE_FILTER} && (${additional.trim()})`
    : ORDER_BASE_FILTER

async function fetchOrders(
  client: SanityClientLike,
  additionalFilter: string | undefined,
  params: Record<string, unknown> = {},
  sort: string = SORT_MAP.createdAtDesc,
  limit?: number,
  offset?: number,
): Promise<OrdersListResult> {
  const limitValue = clampLimit(limit)
  const offsetValue = clampOffset(offset)
  const filter = buildFilter(additionalFilter)
  const rangeClause = `[${offsetValue}...${offsetValue + limitValue}]`
  const query = `{
    "items": *[${filter}] | order(${sort}) ${rangeClause} ${ORDER_PROJECTION},
    "counts": ${buildCountsProjection(filter)}
  }`

  return client.fetch<OrdersListResult>(query, params)
}

async function fetchCheckouts(
  client: SanityClientLike,
  filter: string,
  params: Record<string, unknown> = {},
  limit?: number,
  offset?: number,
): Promise<CheckoutListResult> {
  const limitValue = clampLimit(limit)
  const offsetValue = clampOffset(offset)
  const rangeClause = `[${offsetValue}...${offsetValue + limitValue}]`
  const query = `{
    "items": *[${filter}] | order(createdAt desc) ${rangeClause} ${CHECKOUT_PROJECTION},
    "counts": {"total": count(*[${filter}])}
  }`

  return client.fetch<CheckoutListResult>(query, params)
}

export async function listAll(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(client, undefined, {}, SORT_MAP.createdAtDesc)
}

export async function listUnfulfilled(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(client, 'fulfillmentStatus == "unfulfilled" && !defined(archivedAt)')
}

export async function listUnpaid(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(
    client,
    'paymentStatus in ["unpaid", "pending", "authorized"] && !defined(archivedAt)',
  )
}

export async function listOpen(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(client, 'status == "open" && !defined(archivedAt)')
}

export async function listArchived(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(client, 'defined(archivedAt)')
}

export async function listDraftInvoices(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(
    client,
    'status == "draft" && isInvoice == true && coalesce(isQuote, false) == false',
  )
}

export async function listDraftQuotes(client: SanityClientLike): Promise<OrdersListResult> {
  return fetchOrders(client, 'status == "draft" && isQuote == true')
}

export async function listAbandonedCheckouts(client: SanityClientLike): Promise<CheckoutListResult> {
  return fetchCheckouts(
    client,
    '_type == "checkout" && status in ["abandoned", "expired"]',
  )
}

export async function listByFilters(
  client: SanityClientLike,
  params: OrderFilterParams = {},
): Promise<OrdersListResult> {
  const filters: string[] = []
  const queryParams: Record<string, unknown> = {}

  if (params.dateFrom) {
    filters.push('defined(createdAt) && createdAt >= $dateFrom')
    queryParams.dateFrom = params.dateFrom
  }

  if (params.dateTo) {
    filters.push('defined(createdAt) && createdAt <= $dateTo')
    queryParams.dateTo = params.dateTo
  }

  if (params.status && params.status.length > 0) {
    filters.push('status in $status')
    queryParams.status = params.status
  }

  if (params.paymentStatus && params.paymentStatus.length > 0) {
    filters.push('paymentStatus in $paymentStatus')
    queryParams.paymentStatus = params.paymentStatus
  }

  if (params.fulfillmentStatus && params.fulfillmentStatus.length > 0) {
    filters.push('fulfillmentStatus in $fulfillmentStatus')
    queryParams.fulfillmentStatus = params.fulfillmentStatus
  }

  if (typeof params.isInvoice === 'boolean') {
    filters.push(params.isInvoice ? 'isInvoice == true' : 'coalesce(isInvoice, false) == false')
  }

  if (typeof params.isQuote === 'boolean') {
    filters.push(params.isQuote ? 'isQuote == true' : 'coalesce(isQuote, false) == false')
  }

  if (params.tagAny && params.tagAny.length > 0) {
    filters.push('count(tags[@._ref in $tagAny]) > 0')
    queryParams.tagAny = params.tagAny
  }

  if (params.tagAll && params.tagAll.length > 0) {
    filters.push('count(tags[@._ref in $tagAll]) == count($tagAll)')
    queryParams.tagAll = params.tagAll
  }

  if (typeof params.archived === 'boolean') {
    filters.push(params.archived ? 'defined(archivedAt)' : '!defined(archivedAt)')
  }

  if (params.search && params.search.trim().length > 0) {
    const escaped = escapeRegExp(params.search.trim())
    const pattern = `(?i).*${escaped}.*`
    // PERFORMANCE NOTE: For large datasets, ensure 'orderNumber', 'customerName', and 'customerEmail'
    // are indexed in the Sanity schema to optimize search performance.
    filters.push(
      'string(orderNumber) match $searchPattern || customerName match $searchPattern || customerEmail match $searchPattern || _id match $searchPattern',
    )
    queryParams.searchPattern = pattern
  }

  const filterExpression = filters.join(' && ')
  const sortKey = params.sort && SORT_MAP[params.sort] ? SORT_MAP[params.sort] : SORT_MAP.createdAtDesc

  return fetchOrders(client, filterExpression, queryParams, sortKey, params.limit, params.offset)
}
