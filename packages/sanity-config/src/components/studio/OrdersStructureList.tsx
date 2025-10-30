import React, {useEffect, useMemo, useState, useCallback} from 'react'
import {
  Badge,
  Box,
  Card,
  Flex,
  Inline,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@sanity/ui'
import {useClient} from 'sanity'
import {usePaneRouter} from 'sanity/desk'

type OrderListOptions = {
  title?: string
  filter?: string
  schemaType?: string
  shippingView?: boolean
  allowArchivedToggle?: boolean
  params?: Record<string, unknown>
  apiVersion?: string
}

type ShippingSelection = {
  service?: string | null
  amount?: number | null
}

type OrderListRecord = {
  _id: string
  _type?: string
  orderNumber?: string | null
  createdAt?: string | null
  archivedAt?: string | null
  status?: string | null
  paymentStatus?: string | null
  fulfillmentStatus?: string | null
  customerFirstName?: string | null
  customerLastName?: string | null
  customerName?: string | null
  tags?: Array<string | Record<string, unknown>> | null
  systemTags?: Array<string | Record<string, unknown>> | null
  total?: number | null
  totalAmount?: number | null
  amountTotal?: number | null
  amountSubtotal?: number | null
  amountShipping?: number | null
  shippingAmount?: number | null
  lineItemCount?: number | null
  shippingSelection?: ShippingSelection | null
  selectedService?: ShippingSelection | null
  shippingOption?: ShippingSelection | null
}

type OrdersStructureListProps = {
  options?: OrderListOptions
}

const MAX_ORDERS = 200
const DEFAULT_API_VERSION = '2024-10-01'

const ORDER_LIST_PROJECTION = `{
  _id,
  _type,
  orderNumber,
  createdAt,
  archivedAt,
  status,
  paymentStatus,
  fulfillmentStatus,
  'customerFirstName': coalesce(customerRef->firstName, customer->firstName),
  'customerLastName': coalesce(customerRef->lastName, customer->lastName),
  'customerName': coalesce(customerRef->name, customer->name, customerName),
  'tags': coalesce(tags, []),
  'systemTags': coalesce(systemTags, []),
  total,
  totalAmount,
  amountTotal,
  amountSubtotal,
  amountShipping,
  shippingAmount,
  'lineItemCount': coalesce(count(lineItems[]), count(cart[]), count(items[]), 0),
  shippingSelection{service, amount},
  selectedService{service, amount},
  shippingOption{service, amount},
}`

const normalizeFilter = (filter?: string, schemaType?: string, excludeArchived?: boolean) => {
  const trimmed = filter?.trim()
  const base = trimmed && trimmed.length > 0 ? trimmed : schemaType ? `_type == "${schemaType}"` : ''
  const clauses = [base]
  if (excludeArchived) {
    clauses.push('!defined(archivedAt)')
  }
  return clauses.filter(Boolean).join(' && ')
}

const buildQuery = (filterClause: string) => {
  const clause = filterClause.trim()
  if (!clause) {
    return `*[] | order(coalesce(createdAt, _createdAt) desc)[0...${MAX_ORDERS}] ${ORDER_LIST_PROJECTION}`
  }
  return `*[${clause}] | order(coalesce(createdAt, _createdAt) desc)[0...${MAX_ORDERS}] ${ORDER_LIST_PROJECTION}`
}

const formatCurrency = (value?: number | null, currency: string = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch (error) {
    console.warn('OrdersStructureList: failed to format currency', error)
    return `$${value.toFixed(2)}`
  }
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {numeric: 'auto'})

const formatTimeAgo = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const diffMs = date.getTime() - Date.now()
  const divisions: Array<{unit: Intl.RelativeTimeFormatUnit; ms: number}> = [
    {unit: 'year', ms: 1000 * 60 * 60 * 24 * 365},
    {unit: 'month', ms: 1000 * 60 * 60 * 24 * 30},
    {unit: 'week', ms: 1000 * 60 * 60 * 24 * 7},
    {unit: 'day', ms: 1000 * 60 * 60 * 24},
    {unit: 'hour', ms: 1000 * 60 * 60},
    {unit: 'minute', ms: 1000 * 60},
    {unit: 'second', ms: 1000},
  ]

  for (const division of divisions) {
    const divisionValue = diffMs / division.ms
    if (Math.abs(divisionValue) >= 1) {
      return relativeTimeFormatter.format(Math.round(divisionValue), division.unit)
    }
  }

  return 'just now'
}

const formatItemCount = (value?: number | null) => {
  const count = typeof value === 'number' && !Number.isNaN(value) ? value : 0
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

const coalesceAmount = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }
  return undefined
}

const resolveShippingService = (record: OrderListRecord) => {
  return (
    record.shippingSelection?.service ||
    record.selectedService?.service ||
    record.shippingOption?.service ||
    'Standard'
  )
}

const resolveOrderTotal = (record: OrderListRecord) =>
  coalesceAmount(
    record.total,
    record.totalAmount,
    record.amountTotal,
    record.amountSubtotal,
  )

const resolveShippingTotal = (record: OrderListRecord) =>
  coalesceAmount(
    record.amountShipping,
    record.shippingAmount,
    record.shippingSelection?.amount ?? undefined,
    record.selectedService?.amount ?? undefined,
    record.shippingOption?.amount ?? undefined,
  )

const normalizeTag = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const candidate = obj.title || obj.label || obj.name || obj.value
    if (typeof candidate === 'string') return candidate
  }
  return null
}

const deriveCustomerName = (record: OrderListRecord) => {
  const first = record.customerFirstName?.trim() || ''
  const last = record.customerLastName?.trim() || ''
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  const fallback = record.customerName?.trim()
  if (fallback) return fallback
  return 'Unknown customer'
}

const ShopifyOrdersList = React.forwardRef<HTMLDivElement, OrdersStructureListProps>((props, ref) => {
  const options = props.options || {}
  const {
    filter,
    schemaType,
    shippingView,
    allowArchivedToggle,
    params,
    apiVersion = DEFAULT_API_VERSION,
  } = options

  const [includeArchived, setIncludeArchived] = useState(false)
  const [orders, setOrders] = useState<OrderListRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const client = useClient({apiVersion})
  const router = usePaneRouter()

  const serializedParams = useMemo(() => JSON.stringify(params || {}), [params])

  const filterClause = useMemo(
    () =>
      normalizeFilter(
        filter,
        schemaType,
        allowArchivedToggle ? !includeArchived : false,
      ),
    [allowArchivedToggle, filter, includeArchived, schemaType],
  )

  const query = useMemo(() => buildQuery(filterClause), [filterClause])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const parsedParams = serializedParams ? (JSON.parse(serializedParams) as Record<string, unknown>) : {}

    client
      .fetch<OrderListRecord[]>(query, parsedParams)
      .then((result) => {
        if (cancelled) return
        setOrders(Array.isArray(result) ? result : [])
      })
      .catch((err) => {
        if (cancelled) return
        console.error('OrdersStructureList: failed to fetch orders', err)
        setError(err?.message || 'Unable to load orders right now.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, query, serializedParams])

  const handleOpen = useCallback(
    (order: OrderListRecord) => {
      const schema = order._type || schemaType || 'order'
      router?.navigateIntent?.('edit', {id: order._id, type: schema})
    },
    [router, schemaType],
  )

  const resolvedOrders = orders
  const amountFormatter = shippingView ? resolveShippingTotal : resolveOrderTotal

  return (
    <Box padding={4} ref={ref}>
      {allowArchivedToggle ? (
        <Flex align="center" justify="flex-end" marginBottom={4}>
          <Inline space={3}>
            <Text size={1} tone="secondary">
              Show archived
            </Text>
            <Switch
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
            />
          </Inline>
        </Flex>
      ) : null}

      {loading ? (
        <Flex align="center" justify="center" paddingY={6}>
          <Spinner muted />
        </Flex>
      ) : error ? (
        <Card tone="critical" padding={4} radius={3}>
          <Text size={1}>{error}</Text>
        </Card>
      ) : resolvedOrders.length === 0 ? (
        <Card padding={4} radius={3}>
          <Text size={1} tone="secondary">
            No entries found.
          </Text>
        </Card>
      ) : (
        <Stack space={3}>
          {resolvedOrders.map((order) => {
            const itemCountLabel = formatItemCount(order.lineItemCount ?? 0)
            const createdLabel = formatTimeAgo(order.createdAt)
            const customerName = deriveCustomerName(order)
            const serviceLabel = resolveShippingService(order)
            const amountValue = amountFormatter(order)
            const amountLabel = formatCurrency(amountValue)
            const manualTags = (order.tags || []).map(normalizeTag).filter(Boolean) as string[]
            const systemTags = (order.systemTags || []).map(normalizeTag).filter(Boolean) as string[]
            const isCanceled = order.status?.toLowerCase() === 'canceled'

            return (
              <Card
                key={order._id}
                padding={3}
                radius={3}
                shadow={1}
                tone="transparent"
                as="button"
                onClick={() => handleOpen(order)}
                style={{textAlign: 'left'}}
              >
                <Stack space={2}>
                  <Flex align="center" gap={2}>
                    <Text size={2} weight="semibold">
                      #{order.orderNumber || '—'}
                    </Text>
                    {order.archivedAt ? <Badge tone="default" mode="outline">Archived</Badge> : null}
                    {isCanceled ? <Badge tone="critical">Canceled</Badge> : null}
                  </Flex>

                  <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
                    <Box flex={1}>
                      <Stack space={2}>
                        <Text size={1} tone="secondary">
                          {customerName} • {itemCountLabel} • {createdLabel}
                        </Text>
                        <Text size={1} tone="secondary">
                          {serviceLabel}
                        </Text>
                        {(manualTags.length > 0 || systemTags.length > 0) && (
                          <Flex align="center" gap={2} wrap="wrap">
                            {manualTags.map((tag) => (
                              <Badge key={`manual-${order._id}-${tag}`} tone="primary" mode="outline">
                                {tag}
                              </Badge>
                            ))}
                            {systemTags.map((tag) => (
                              <Badge key={`system-${order._id}-${tag}`} tone="default" mode="outline">
                                {tag}
                              </Badge>
                            ))}
                          </Flex>
                        )}
                      </Stack>
                    </Box>
                    <Box>
                      <Text size={2} weight="semibold">
                        {amountLabel}
                      </Text>
                    </Box>
                  </Flex>
                </Stack>
              </Card>
            )
          })}
        </Stack>
      )}
    </Box>
  )
})

ShopifyOrdersList.displayName = 'ShopifyOrdersList'

export default ShopifyOrdersList
