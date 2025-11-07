import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Menu,
  MenuButton,
  MenuItem,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import {OkHandIcon, RobotIcon, SearchIcon} from '@sanity/icons'
import {
  coerceStringArray,
  deriveOptionsFromMetadata,
  normalizeMetadataEntries,
  remainingMetadataEntries,
  shouldDisplayMetadataSegment,
  uniqueStrings,
} from '../../utils/cartItemDetails'
import {formatOrderNumber, orderNumberSearchTokens} from '../../utils/orderNumber'
import {GROQ_FILTER_EXCLUDE_EXPIRED} from '../../utils/orderFilters'

type RawCartItem = {
  quantity?: number | null
}

type RawShippingLog = {
  status?: string | null
  createdAt?: string | null
}

type RawSelectedService = {
  carrier?: string | null
  service?: string | null
  serviceCode?: string | null
}

type RawShippingAddress = {
  name?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  phone?: string | null
  email?: string | null
}

type RawOrder = {
  _id: string
  orderNumber?: string | null
  stripeSessionId?: string | null
  customerName?: string | null
  customerEmail?: string | null
  totalAmount?: number | null
  status?: string | null
  paymentStatus?: string | null
  createdAt?: string | null
  _createdAt?: string | null
  fulfilledAt?: string | null
  cart?: Array<RawCartItem | null> | null
  shippingLog?: Array<RawShippingLog | null> | null
  shippingCarrier?: string | null
  selectedService?: RawSelectedService | null
  shippingAddress?: RawShippingAddress | null
}

type OrderRow = {
  id: string
  orderNumber: string
  createdAtLabel: string
  createdAtValue: number
  fulfilledAtValue: number | null
  customerLabel: string
  customerEmail: string | null
  channel: string
  total: number
  paymentStatus: string
  fulfillmentStatus: string
  fulfillmentStatusBase: string
  itemsCount: number
  deliveryStatus: string
  deliveryMethod: string
  tags: string[]
  locationKey: string | null
  locationLabel: string | null
  searchIndex: string
}

type DatePreset = 'today' | '7' | '30' | '90' | '365' | 'all'

type TabKey = 'all' | 'unfulfilled' | 'unpaid' | 'open' | 'archived' | 'returns'

const ORDER_QUERY = `*[_type == "order" && (${GROQ_FILTER_EXCLUDE_EXPIRED})] | order(dateTime(coalesce(createdAt, _createdAt)) desc)[0...200]{
  _id,
  orderNumber,
  stripeSessionId,
  customerName,
  customerEmail,
  totalAmount,
  status,
  paymentStatus,
  createdAt,
  _createdAt,
  fulfilledAt,
  cart[]{quantity},
  shippingLog[]{status, createdAt},
  shippingCarrier,
  selectedService{carrier, service, serviceCode},
  shippingAddress{state, country, city, name}
}`

const ORDER_PREVIEW_QUERY = `*[_type == "order" && _id == $id][0]{
  _id,
  orderNumber,
  status,
  paymentStatus,
  totalAmount,
  amountSubtotal,
  amountShipping,
  amountTax,
  shippingCarrier,
  trackingNumber,
  shippingLabelUrl,
  packingSlipUrl,
  createdAt,
  fulfilledAt,
  customerEmail,
  customerName,
  shippingAddress,
  cart[]{
    _key,
    name,
    sku,
    quantity,
    price,
    lineTotal,
    optionSummary,
    optionDetails,
    upgrades,
    metadata[]{key,value}
  },
  shippingLog[]{
    _key,
    status,
    message,
    trackingNumber,
    trackingUrl,
    labelUrl,
    createdAt
  }
}`

const currencyFormatter = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const datePresets: Array<{value: DatePreset; label: string}> = [
  {value: 'today', label: 'Today'},
  {value: '7', label: 'Last 7 days'},
  {value: '30', label: 'Last 30 days'},
  {value: '90', label: 'Last 90 days'},
  {value: '365', label: 'Last 12 months'},
  {value: 'all', label: 'All time'},
]

const tabDefinitions: Array<{key: TabKey; label: string}> = [
  {key: 'all', label: 'All'},
  {key: 'unfulfilled', label: 'Unfulfilled'},
  {key: 'unpaid', label: 'Unpaid'},
  {key: 'open', label: 'Open'},
  {key: 'archived', label: 'Archived'},
  {key: 'returns', label: 'Return requests'},
]

const GRID_TEMPLATE_COLUMNS =
  '40px 140px 200px 180px minmax(220px, 1fr) 120px 180px 120px 140px 160px 160px 160px'
const GRID_COLUMN_GAP = 12
const ORDER_STICKY_LEFT = 40 + GRID_COLUMN_GAP
const HEADER_BACKGROUND_COLOR = 'var(--card-background-color)'
const ROW_BACKGROUND_COLOR = 'var(--card-background-color)'
const ROW_SELECTED_BACKGROUND = 'rgba(59, 130, 246, 0.08)'
const STICKY_ORDER_BOX_SHADOW = '2px 0 0 rgba(15, 23, 42, 0.08)'

const STICKY_CHECKBOX_BASE: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
}

const STICKY_ORDER_BASE: CSSProperties = {
  position: 'sticky',
  left: ORDER_STICKY_LEFT,
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
  boxShadow: STICKY_ORDER_BOX_SHADOW,
}

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled'])
const CLOSED_PAYMENT_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'void',
  'failed',
  'expired',
  'checkout.session.expired',
  'stripe.checkout.session.expired',
  'checkout_session_expired',
  'incomplete_expired',
  'abandoned',
])
const OPEN_FULFILLMENT_STATUSES = new Set(['pending', 'processing', 'paid'])
const OPEN_PAYMENT_STATUSES = new Set(['pending', 'processing'])

function isCancelledStatus(value: string | null | undefined): boolean {
  if (!value) return false
  return CANCELLED_STATUSES.has(value.toLowerCase())
}

function isClosedPaymentStatus(value: string | null | undefined): boolean {
  if (!value) return false
  return CLOSED_PAYMENT_STATUSES.has(value.toLowerCase())
}

const formatKeyLabel = (label: string): string =>
  label
    .replace(/[_-]+/g, ' ')
    .replace(/\w\S*/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1))

function formatMetadataSegments(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    return coerceStringArray(trimmed)
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => formatMetadataSegments(entry))
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>

    const hasLineItemKeys = ['n', 'q', 'p'].some((key) => key in obj)
    if (hasLineItemKeys) {
      const lines: string[] = []
      if (typeof obj.n === 'string' && obj.n.trim()) {
        lines.push(`Name: ${obj.n.trim()}`)
      }
      if (typeof obj.q === 'number' && Number.isFinite(obj.q)) {
        lines.push(`Quantity: ${obj.q}`)
      } else if (typeof obj.q === 'string' && obj.q.trim()) {
        lines.push(`Quantity: ${obj.q.trim()}`)
      }
      const priceValue =
        typeof obj.p === 'number'
          ? obj.p
          : typeof obj.p === 'string' && obj.p.trim()
            ? Number(obj.p)
            : null
      if (priceValue !== null && Number.isFinite(priceValue)) {
        lines.push(`Price: ${currencyFormatter.format(Number(priceValue))}`)
      }
      return lines
    }

    return Object.entries(obj).flatMap(([key, val]) => {
      if (val === undefined || val === null || val === '') return []
      const label = formatKeyLabel(key)
      if (typeof val === 'number') return [`${label}: ${val}`]
      if (typeof val === 'string') return [`${label}: ${val}`]
      const nested = formatMetadataSegments(val)
      return nested.length ? [`${label}: ${nested.join(', ')}`] : []
    })
  }

  if (typeof value === 'number') return [String(value)]
  if (typeof value === 'boolean') return [value ? 'Yes' : 'No']

  return []
}

function normalizeStatusLabel(value: string | null | undefined): string {
  if (!value) return 'Pending'
  return value
    .split(/\s+/)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function badgeTone(status: string): 'positive' | 'caution' | 'critical' | 'default' {
  const normalized = status.toLowerCase()
  if (
    normalized.startsWith('fulfilled') ||
    ['paid', 'delivered', 'succeeded', 'completed'].includes(normalized)
  ) {
    return 'positive'
  }
  if (['pending', 'processing', 'in transit', 'label created'].includes(normalized)) return 'caution'
  if (
    [
      'cancelled',
      'canceled',
      'returned',
      'refunded',
      'failed',
      'exception',
      'void',
      'expired',
      'checkout.session.expired',
      'stripe.checkout.session.expired',
      'checkout_session_expired',
      'incomplete_expired',
      'abandoned',
    ].includes(normalized)
  )
    return 'critical'
  return 'default'
}

function deriveDeliveryStatus(order: RawOrder, shippingStatuses: string[]): string {
  if (isCancelledStatus(order.status)) return 'Cancelled'
  if (!shippingStatuses.length && order.fulfilledAt) return 'Delivered'
  const latest = shippingStatuses[0] || ''
  if (shippingStatuses.some((status) => status.includes('deliver'))) return 'Delivered'
  if (shippingStatuses.some((status) => status.includes('transit'))) return 'In transit'
  if (shippingStatuses.some((status) => status.includes('label'))) return 'Label created'
  if (shippingStatuses.some((status) => status.includes('return'))) return 'Return initiated'
  if (latest) return normalizeStatusLabel(latest)
  return order.status === 'fulfilled' ? 'Fulfilled' : 'Pending'
}

function deriveTags(order: RawOrder, shippingStatuses: string[]): string[] {
  const tags = new Set<string>()
  const payment = (order.paymentStatus || '').toLowerCase()

  if (payment.includes('refund')) tags.add('Refunded')
  if (payment.includes('failed')) tags.add('Payment failed')
  if (isCancelledStatus(order.status) || payment.includes('cancel') || isClosedPaymentStatus(order.paymentStatus)) {
    tags.add('Cancelled')
  }
  if (shippingStatuses.some((status) => status.includes('return'))) tags.add('Return')
  if (shippingStatuses.some((status) => status.includes('exception'))) tags.add('Exception')

  return Array.from(tags)
}

function normalizeOrder(raw: RawOrder): OrderRow {
  const createdISO = raw.createdAt || raw._createdAt || new Date().toISOString()
  const createdAtValue = Date.parse(createdISO) || Date.now()
  const fulfilledAtValue = raw.fulfilledAt ? Date.parse(raw.fulfilledAt) || null : null

  const customerName = raw.customerName || raw.shippingAddress?.name || raw.customerEmail || 'Customer'
  const formattedOrderNumber = formatOrderNumber(raw.orderNumber)
  const orderRef = formattedOrderNumber || `#${raw._id.slice(-6).toUpperCase()}`
  const channel = raw.stripeSessionId ? 'Online Store' : 'Manual Entry'
  const total = typeof raw.totalAmount === 'number' && Number.isFinite(raw.totalAmount) ? raw.totalAmount : 0
  const itemsCount = (raw.cart || []).reduce((sum, item) => {
    const qty = item?.quantity
    if (typeof qty === 'number' && Number.isFinite(qty)) return sum + qty
    return sum
  }, 0)

  const shippingEvents = (raw.shippingLog || [])
    .filter((entry): entry is RawShippingLog => Boolean(entry))
    .map((entry) => ({
      status: (entry.status || '').toLowerCase(),
      createdAt: entry.createdAt ? Date.parse(entry.createdAt) || 0 : 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)

  const shippingStatuses = shippingEvents.map((event) => event.status).filter(Boolean)
  const deliveryStatus = deriveDeliveryStatus(raw, shippingStatuses)
  const tags = deriveTags(raw, shippingStatuses)

  const locationParts = [raw.shippingAddress?.state, raw.shippingAddress?.country].filter(Boolean)
  const locationLabel = locationParts.length ? locationParts.join(', ') : null
  const locationKey = locationLabel ? locationLabel.toLowerCase() : null

  const paymentStatus = normalizeStatusLabel(raw.paymentStatus)
  const normalizedFulfillment = normalizeStatusLabel(raw.status)
  const baseFulfillmentStatus = normalizedFulfillment.toLowerCase()
  const hasManualFulfillment = shippingEvents.some((event) => event.status === 'fulfilled_manual')
  let fulfillmentStatus = normalizedFulfillment
  let fulfillmentStatusBase = baseFulfillmentStatus
  if (baseFulfillmentStatus === 'fulfilled') {
    fulfillmentStatus = hasManualFulfillment ? 'Fulfilled (Manual)' : 'Fulfilled (Auto)'
    fulfillmentStatusBase = 'fulfilled'
  }
  const deliveryMethod = raw.selectedService?.service || raw.shippingCarrier || '—'

  const searchTokens = [
    ...orderNumberSearchTokens(raw.orderNumber),
    orderRef,
    customerName,
    raw.customerEmail || '',
    fulfillmentStatus,
    paymentStatus,
  ].filter((token): token is string => Boolean(token))
  const searchIndex = searchTokens.join(' ').toLowerCase()

  return {
    id: raw._id,
    orderNumber: orderRef,
    createdAtLabel: dateTimeFormatter.format(new Date(createdAtValue)),
    createdAtValue,
    fulfilledAtValue,
    customerLabel: customerName,
    customerEmail: raw.customerEmail || null,
    channel,
    total,
    paymentStatus,
    fulfillmentStatus,
    fulfillmentStatusBase,
    itemsCount,
    deliveryStatus,
    deliveryMethod,
    tags,
    locationKey,
    locationLabel,
    searchIndex,
  }
}

function matchesTab(order: OrderRow, key: TabKey): boolean {
  const fulfillment = order.fulfillmentStatusBase
  const payment = order.paymentStatus.toLowerCase()
  const fulfillmentCancelled = isCancelledStatus(order.fulfillmentStatusBase)
  const paymentClosed = isClosedPaymentStatus(order.paymentStatus)
  switch (key) {
    case 'all':
      return true
    case 'unfulfilled':
      return fulfillment !== 'fulfilled' && !fulfillmentCancelled
    case 'unpaid':
      if (fulfillment === 'expired') return false
      return !['paid', 'succeeded'].includes(payment) && !paymentClosed
    case 'open':
      if (fulfillmentCancelled || paymentClosed) return false
      return OPEN_FULFILLMENT_STATUSES.has(fulfillment) || OPEN_PAYMENT_STATUSES.has(payment)
    case 'archived':
      return fulfillmentCancelled || paymentClosed
    case 'returns':
      return order.tags.some((tag) => tag.toLowerCase().includes('return'))
    default:
      return true
  }
}

function formatItems(count: number): string {
  if (count === 0) return '0 items'
  return `${count} item${count === 1 ? '' : 's'}`
}

function formatAverageDuration(milliseconds: number | null): string {
  if (!milliseconds || milliseconds <= 0) return '—'
  const hours = milliseconds / (1000 * 60 * 60)
  if (hours < 24) return `${hours.toFixed(1)} hrs`
  const days = hours / 24
  return `${days.toFixed(1)} days`
}

export default function OrdersDashboard() {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const toast = useToast()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTab, setSelectedTab] = useState<TabKey>('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionInProgress, setActionInProgress] = useState<'fulfill' | 'archive' | null>(null)
  const fetchControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      fetchControllerRef.current?.abort()
      const controller = new AbortController()
      fetchControllerRef.current = controller

      if (!cancelled) {
        setLoading(true)
        setError(null)
      }

      try {
        const data: RawOrder[] = await client.fetch(ORDER_QUERY, {}, {signal: controller.signal})
        if (cancelled || controller.signal.aborted) return
        setOrders(data.map(normalizeOrder))
        setError(null)
      } catch (err: any) {
        if (cancelled || controller.signal.aborted) return
        const name = err?.name || err?.constructor?.name
        if (name === 'AbortError') return
        setError(String(err?.message || err || 'Failed to load orders'))
      } finally {
        if (!cancelled && fetchControllerRef.current === controller) {
          fetchControllerRef.current = null
          setLoading(false)
        }
      }
    }

    load()
    const subscription = client
      .listen(ORDER_QUERY, {}, {visibility: 'query', tag: 'orders-dashboard'})
      .subscribe({
        next: () => load(),
        error: (listenError) => {
          if (cancelled) return
          const name = listenError?.name || listenError?.constructor?.name
          if (name === 'AbortError') return
          console.error('Orders dashboard listen error', listenError)
        },
      })

    return () => {
      cancelled = true
      fetchControllerRef.current?.abort()
      try {
        subscription.unsubscribe()
      } catch {
        /* noop */
      }
    }
  }, [client])

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set<string>()
      orders.forEach((order) => {
        if (prev.has(order.id)) valid.add(order.id)
      })
      return valid
    })
  }, [orders])

  const locationOptions = useMemo(() => {
    const map = new Map<string, string>()
    orders.forEach((order) => {
      if (order.locationKey && order.locationLabel) {
        map.set(order.locationKey, order.locationLabel)
      }
    })
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({value, label}))
  }, [orders])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    const now = Date.now()

    let cutoff: number | null = null
    if (datePreset === 'today') {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      cutoff = startOfDay.getTime()
    } else if (datePreset !== 'all') {
      const days = Number(datePreset)
      if (Number.isFinite(days)) cutoff = now - days * 24 * 60 * 60 * 1000
    }

    return orders.filter((order) => {
      if (locationFilter !== 'all' && order.locationKey !== locationFilter) return false
      if (cutoff && order.createdAtValue < cutoff) return false
      if (!matchesTab(order, selectedTab)) return false
      if (term && !order.searchIndex.includes(term)) return false
      return true
    })
  }, [orders, search, selectedTab, datePreset, locationFilter])

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setActiveOrderId((prev) => (prev === null ? prev : null))
      return
    }
    setActiveOrderId((prev) => {
      if (prev && filteredOrders.some((order) => order.id === prev)) return prev
      return filteredOrders[0]?.id || null
    })
  }, [filteredOrders])

  const metrics = useMemo(() => {
    const ordersCount = filteredOrders.length
    const itemsOrdered = filteredOrders.reduce((sum, order) => sum + order.itemsCount, 0)
    const returns = filteredOrders.filter((order) => order.tags.some((tag) => tag.toLowerCase().includes('return')))
      .length
    const fulfilled = filteredOrders.filter((order) => order.fulfillmentStatusBase === 'fulfilled').length
    const delivered = filteredOrders.filter((order) => order.deliveryStatus.toLowerCase().includes('deliver')).length

    const durations = filteredOrders
      .filter((order) => order.fulfilledAtValue && order.fulfilledAtValue > order.createdAtValue)
      .map((order) => (order.fulfilledAtValue! - order.createdAtValue))

    const averageDuration = durations.length
      ? durations.reduce((sum, diff) => sum + diff, 0) / durations.length
      : null

    return {
      ordersCount,
      itemsOrdered,
      returnsCount: returns,
      fulfilledCount: fulfilled,
      deliveredCount: delivered,
      averageFulfillmentDuration: averageDuration,
    }
  }, [filteredOrders])

  const tabCounts = useMemo(() => {
    const counts = new Map<TabKey, number>(tabDefinitions.map(({key}) => [key, 0]))
    orders.forEach((order) => {
      tabDefinitions.forEach(({key}) => {
        if (matchesTab(order, key)) counts.set(key, (counts.get(key) || 0) + 1)
      })
    })
    return counts
  }, [orders])

  const markSelectedFulfilled = useCallback(async () => {
    if (selectedIds.size === 0) return
    setActionInProgress('fulfill')
    setActionLoading(true)
    const ids = Array.from(selectedIds)
    const timestamp = new Date().toISOString()

    try {
      let tx = client.transaction()
      const buildLogEntry = () => ({
        _type: 'shippingLogEntry' as const,
        status: 'fulfilled_manual',
        message: 'Order marked fulfilled in Orders dashboard',
        createdAt: timestamp,
      })

      ids.forEach((id) => {
        tx = tx.patch(id, (patch) =>
          patch
            .set({
              status: 'fulfilled',
              fulfilledAt: timestamp,
            })
            .setIfMissing({shippingLog: []})
            .append('shippingLog', [buildLogEntry()])
        )
      })

      await tx.commit({autoGenerateArrayKeys: true})

      await Promise.all(
        ids.map(async (id) => {
          try {
            await client
              .patch(`drafts.${id}`)
              .set({
                status: 'fulfilled',
                fulfilledAt: timestamp,
              })
              .setIfMissing({shippingLog: []})
              .append('shippingLog', [buildLogEntry()])
              .commit({autoGenerateArrayKeys: true})
          } catch (err: any) {
            const statusCode = err?.statusCode || err?.response?.statusCode
            if (statusCode && statusCode !== 404) {
              console.warn(`Orders dashboard: failed to update draft ${id}`, err)
            }
          }
        })
      )

      setOrders((prev) =>
        prev.map((order) => {
          if (!selectedIds.has(order.id)) return order
          const normalizedDelivery = (order.deliveryStatus || '').toLowerCase()
          const deliveryStatus = normalizedDelivery.includes('deliver') ? order.deliveryStatus : 'Fulfilled'
          return {
            ...order,
            fulfillmentStatus: 'Fulfilled (Manual)',
            fulfillmentStatusBase: 'fulfilled',
            fulfilledAtValue: Date.parse(timestamp),
            deliveryStatus,
          }
        })
      )

      setSelectedIds(new Set())

      toast.push({
        status: 'success',
        title: 'Orders fulfilled',
        description: `Updated ${ids.length} order${ids.length === 1 ? '' : 's'}.`,
      })
    } catch (err: any) {
      console.error('orders-dashboard: failed to mark fulfilled', err)
      toast.push({
        status: 'error',
        title: 'Could not mark fulfilled',
        description: err?.message || 'Unable to update selected orders. Please try again.',
      })
    } finally {
      setActionLoading(false)
      setActionInProgress(null)
    }
  }, [client, selectedIds, toast])

  const archiveSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    setActionInProgress('archive')
    setActionLoading(true)
    const ids = Array.from(selectedIds)
    const selectedSet = new Set(ids)
    const timestamp = new Date().toISOString()

    const buildLogEntry = () => ({
      _type: 'shippingLogEntry' as const,
      status: 'cancelled_manual',
      message: 'Order archived in Orders dashboard',
      createdAt: timestamp,
    })

    try {
      let tx = client.transaction()

      ids.forEach((id) => {
        tx = tx.patch(id, (patch) =>
          patch
            .set({
              status: 'cancelled',
              paymentStatus: 'cancelled',
              fulfilledAt: null,
            })
            .setIfMissing({shippingLog: []})
            .append('shippingLog', [buildLogEntry()])
        )
      })

      await tx.commit({autoGenerateArrayKeys: true})

      await Promise.all(
        ids.map(async (id) => {
          try {
            await client
              .patch(`drafts.${id}`)
              .set({
                status: 'cancelled',
                paymentStatus: 'cancelled',
                fulfilledAt: null,
              })
              .setIfMissing({shippingLog: []})
              .append('shippingLog', [buildLogEntry()])
              .commit({autoGenerateArrayKeys: true})
          } catch (err: any) {
            const statusCode = err?.statusCode || err?.response?.statusCode
            if (statusCode && statusCode !== 404) {
              console.warn(`Orders dashboard: failed to update draft ${id}`, err)
            }
          }
        })
      )

      setOrders((prev) =>
        prev.map((order) => {
          if (!selectedSet.has(order.id)) return order
          const updatedTags = new Set(order.tags)
          updatedTags.add('Cancelled')
          return {
            ...order,
            fulfillmentStatus: 'Cancelled',
            fulfillmentStatusBase: 'cancelled',
            paymentStatus: 'Cancelled',
            deliveryStatus: 'Cancelled',
            fulfilledAtValue: null,
            tags: Array.from(updatedTags),
          }
        })
      )

      setSelectedIds(new Set())

      toast.push({
        status: 'success',
        title: 'Orders archived',
        description: `Moved ${ids.length} order${ids.length === 1 ? '' : 's'} to the archived list.`,
      })
    } catch (err: any) {
      console.error('orders-dashboard: failed to archive orders', err)
      toast.push({
        status: 'error',
        title: 'Could not archive orders',
        description: err?.message || 'Unable to archive selected orders. Please try again.',
      })
    } finally {
      setActionLoading(false)
      setActionInProgress(null)
    }
  }, [client, selectedIds, toast])

  function handleSelect(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const updated = new Set(prev)
      if (next) updated.add(id)
      else updated.delete(id)
      return updated
    })
  }

  function handleSelectAll(next: boolean) {
    if (!next) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(filteredOrders.map((order) => order.id)))
  }

  function handleRowClick(order: OrderRow) {
    setActiveOrderId(order.id)
  }

  function handleOpenOrderDocument(id: string) {
    router.navigateIntent('edit', {id, type: 'order'})
  }

  return (
    <Flex height="fill">
      <Box padding={4} style={{flex: '1 1 auto', overflow: 'auto'}}>
        <Stack space={5}>
          <Flex gap={4} justify="space-between" align="center" style={{flexWrap: 'wrap'}}>
            <Flex gap={4} align="center" style={{flexWrap: 'wrap'}}>
              <Flex direction="column" style={{minWidth: 220}}>
                <Text size={1} muted>
                  Location
                </Text>
                <Select value={locationFilter} onChange={(event) => setLocationFilter(event.currentTarget.value)}>
                  <option value="all">All locations</option>
                  {locationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Flex>
              <Flex direction="column" style={{minWidth: 180}}>
                <Text size={1} muted>
                  Date range
                </Text>
                <Select value={datePreset} onChange={(event) => setDatePreset(event.currentTarget.value as DatePreset)}>
                  {datePresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </Flex>
            </Flex>
            <Flex gap={2} align="center" style={{flexWrap: 'wrap'}}>
              <Button text="Export" mode="ghost" disabled={filteredOrders.length === 0} />
              <MenuButton
                id="orders-dashboard-more-actions"
                button={<Button text="More actions" mode="ghost" disabled={selectedIds.size === 0 || actionLoading} />}
                menu={
                  <Menu>
                    <MenuItem
                      text={actionInProgress === 'fulfill' ? 'Marking as fulfilled…' : 'Mark as fulfilled'}
                      disabled={selectedIds.size === 0 || actionLoading}
                      onClick={markSelectedFulfilled}
                    />
                    <MenuItem text="Send receipt" disabled={selectedIds.size === 0 || actionLoading} />
                    <MenuItem
                      text={actionInProgress === 'archive' ? 'Archiving…' : 'Archive'}
                      disabled={selectedIds.size === 0 || actionLoading}
                      onClick={archiveSelected}
                    />
                  </Menu>
                }
              />
              <Button
                tone="primary"
                text="Create order"
                onClick={() => router.navigateIntent('create', {type: 'order'})}
              />
            </Flex>
          </Flex>

          <Grid columns={[1, 2, 3, 6]} gap={3}>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Orders
                </Text>
                <Text size={4} weight="bold">
                  {metrics.ordersCount}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Items ordered
                </Text>
                <Text size={4} weight="bold">
                  {metrics.itemsOrdered}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Returns
                </Text>
                <Text size={4} weight="bold">
                  {metrics.returnsCount}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Orders fulfilled
                </Text>
                <Text size={4} weight="bold">
                  {metrics.fulfilledCount}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Orders delivered
                </Text>
                <Text size={4} weight="bold">
                  {metrics.deliveredCount}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Order to fulfillment time
                </Text>
                <Text size={4} weight="bold">
                  {formatAverageDuration(metrics.averageFulfillmentDuration)}
                </Text>
              </Stack>
            </Card>
          </Grid>

          <Flex gap={3} align="center" justify="space-between" style={{flexWrap: 'wrap'}}>
            <Flex gap={2} style={{flexWrap: 'wrap'}}>
              {tabDefinitions.map(({key, label}) => (
                <Button
                  key={key}
                  text={`${label}${tabCounts.get(key) ? ` (${tabCounts.get(key)})` : ''}`}
                  mode={selectedTab === key ? 'default' : 'ghost'}
                  tone={selectedTab === key ? 'primary' : undefined}
                  onClick={() => setSelectedTab(key)}
                />
              ))}
            </Flex>
            <Flex gap={3} align="center" style={{flexWrap: 'wrap'}}>
              <Box style={{minWidth: 240}}>
                <TextInput
                  value={search}
                  name="ordersDashboardSearch"
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  icon={SearchIcon}
                  placeholder="Search orders"
                />
              </Box>
            </Flex>
          </Flex>

          {loading ? (
            <Flex align="center" justify="center" padding={5}>
              <Spinner muted />
            </Flex>
          ) : error ? (
            <Card padding={4} tone="critical" radius={3}>
              <Text>{error}</Text>
            </Card>
          ) : filteredOrders.length === 0 ? (
            <Card padding={4} radius={3} tone="transparent">
              <Text muted>No orders match the current filters.</Text>
            </Card>
          ) : (
            <Card padding={0} radius={3} shadow={1} tone="transparent" style={{overflowX: 'auto'}}>
              <Box style={{borderBottom: '1px solid var(--card-border-color)'}}>
                <Flex
                  style={{
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                    gap: `${GRID_COLUMN_GAP}px`,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    color: 'var(--card-muted-fg-color)',
                    width: 'max-content',
                    background: HEADER_BACKGROUND_COLOR,
                  }}
                >
                  <span style={{...STICKY_CHECKBOX_BASE, background: HEADER_BACKGROUND_COLOR, zIndex: 4}}>
                    <Checkbox
                      checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0}
                      indeterminate={selectedIds.size > 0 && selectedIds.size < filteredOrders.length}
                      onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                    />
                  </span>
                  <span
                    style={{
                      ...STICKY_ORDER_BASE,
                      background: HEADER_BACKGROUND_COLOR,
                      zIndex: 3,
                    }}
                  >
                    Order
                  </span>
                  <span>Date</span>
                  <span>Customer</span>
                  <span>Channel</span>
                  <span style={{textAlign: 'right'}}>Total</span>
                  <span>Payment status</span>
                  <span>Fulfillment status</span>
                  <span>Items</span>
                  <span>Delivery status</span>
                  <span>Delivery method</span>
                  <span>Tags</span>
                </Flex>
              </Box>
              <Box>
                {filteredOrders.map((order) => {
                  const isSelected = selectedIds.has(order.id)
                  const isActive = activeOrderId === order.id
                  const rowBackground = isSelected
                    ? ROW_SELECTED_BACKGROUND
                    : isActive
                    ? '#f8fafc'
                    : ROW_BACKGROUND_COLOR

                  return (
                    <Flex
                      key={order.id}
                      onClick={() => handleRowClick(order)}
                      style={{
                        padding: '14px 16px',
                        display: 'grid',
                        gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                        gap: `${GRID_COLUMN_GAP}px`,
                        alignItems: 'center',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--card-border-color)',
                        width: 'max-content',
                        backgroundColor: rowBackground,
                      }}
                    >
                      <span
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                        style={{...STICKY_CHECKBOX_BASE, background: rowBackground}}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={(event) => handleSelect(order.id, event.currentTarget.checked)}
                        />
                      </span>
                      <span
                        style={{
                          ...STICKY_ORDER_BASE,
                          background: rowBackground,
                          fontWeight: 600,
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleOpenOrderDocument(order.id)
                          }}
                          style={{
                            all: 'unset',
                            cursor: 'pointer',
                            color: '#1f2937',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          {order.orderNumber}
                        </button>
                      </span>
                      <span>{order.createdAtLabel}</span>
                      <span>{order.customerLabel}</span>
                      <span>{order.channel}</span>
                      <span style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
                        {currencyFormatter.format(order.total)}
                      </span>
                      <span>
                        <Badge tone={badgeTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                      </span>
                      <span>
                        <Badge tone={badgeTone(order.fulfillmentStatus)}>
                          {order.fulfillmentStatusBase === 'fulfilled' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {order.fulfillmentStatus.toLowerCase().includes('manual') ? (
                                <OkHandIcon aria-hidden style={{width: 14, height: 14}} />
                              ) : (
                                <RobotIcon aria-hidden style={{width: 14, height: 14}} />
                              )}
                              <span>{order.fulfillmentStatus}</span>
                            </span>
                          ) : (
                            order.fulfillmentStatus
                          )}
                        </Badge>
                      </span>
                      <span>{formatItems(order.itemsCount)}</span>
                      <span>
                        <Badge tone={badgeTone(order.deliveryStatus)}>{order.deliveryStatus}</Badge>
                      </span>
                      <span>{order.deliveryMethod}</span>
                      <span>
                        {order.tags.length === 0 ? (
                          <Text size={1} muted>
                            —
                          </Text>
                        ) : (
                          <Flex gap={2} style={{flexWrap: 'wrap'}}>
                            {order.tags.map((tag) => (
                              <Badge key={tag} mode="outline">
                                {tag}
                              </Badge>
                            ))}
                          </Flex>
                        )}
                      </span>
                    </Flex>
                  )
                })}
              </Box>
            </Card>
          )}
        </Stack>
      </Box>
      <OrderPreviewPane orderId={activeOrderId} onOpenDocument={handleOpenOrderDocument} />
    </Flex>
  )
}

interface OrderPreviewPaneProps {
  orderId: string | null
  onOpenDocument: (id: string) => void
}

type OrderPreviewDoc = {
  _id: string
  orderNumber?: string | null
  status?: string | null
  paymentStatus?: string | null
  totalAmount?: number | null
  amountSubtotal?: number | null
  amountShipping?: number | null
  amountTax?: number | null
  shippingCarrier?: string | null
  trackingNumber?: string | null
  shippingLabelUrl?: string | null
  packingSlipUrl?: string | null
  createdAt?: string | null
  fulfilledAt?: string | null
  customerEmail?: string | null
  customerName?: string | null
  shippingAddress?: RawShippingAddress | null
  cart?: Array<
    | null
    | {
        _key?: string
        name?: string
        sku?: string
        quantity?: number | null
        price?: number | null
        lineTotal?: number | null
        optionSummary?: string | null
        optionDetails?: string[] | string | null
        upgrades?: string[] | string | null
        metadata?: Array<{key?: string; value?: string}>
      }
  > | null
  shippingLog?: Array<
    | null
    | {
        _key?: string
        status?: string | null
        message?: string | null
        trackingNumber?: string | null
        trackingUrl?: string | null
        labelUrl?: string | null
        createdAt?: string | null
      }
  > | null
}

type CartItem = NonNullable<NonNullable<OrderPreviewDoc['cart']>[number]>
type ShippingLogEntry = NonNullable<NonNullable<OrderPreviewDoc['shippingLog']>[number]>

function OrderPreviewPane({orderId, onOpenDocument}: OrderPreviewPaneProps) {
  const client = useClient({apiVersion: '2024-10-01'})
  const [order, setOrder] = useState<OrderPreviewDoc | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!orderId) {
      setOrder(null)
      setError(null)
      return () => {
        cancelled = true
      }
    }

    async function fetchOrder() {
      setLoading(true)
      setError(null)
      try {
        const doc = await client.fetch<OrderPreviewDoc>(ORDER_PREVIEW_QUERY, {id: orderId})
        if (!cancelled) {
          setOrder(doc || null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setOrder(null)
          setError(err?.message || 'Failed to load order details')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOrder()

    const subscription = client
      .listen(ORDER_PREVIEW_QUERY, {id: orderId}, {visibility: 'query', tag: 'order-preview-pane'})
      .subscribe(() => {
        fetchOrder()
      })

    return () => {
      cancelled = true
      try {
        subscription.unsubscribe()
      } catch {
        // ignore
      }
    }
  }, [client, orderId])

  const items = useMemo(() => {
    if (!order?.cart || order.cart.length === 0) return []
    return order.cart
      .filter((item): item is CartItem => Boolean(item))
      .map((item) => {
        const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1
        const total =
          typeof item.lineTotal === 'number'
            ? item.lineTotal
            : typeof item.price === 'number'
            ? item.price * quantity
            : null
        const metadataEntries = normalizeMetadataEntries(item.metadata || [])
        const rawName = (item.name || item.sku || 'Item').toString()
        const displayName = rawName.split('•')[0]?.trim() || rawName
        const derived = deriveOptionsFromMetadata(metadataEntries)
        const summary = item.optionSummary?.trim() || derived.optionSummary

        const details: string[] = []
        const detailSeen = new Set<string>()
        const canonicalDetailKey = (input: string) => {
          const trimmed = input.trim()
          if (!trimmed) return null
          const [rawLabel, ...rest] = trimmed.split(':')
          if (rest.length === 0) return trimmed.toLowerCase()
          const value = rest.join(':').trim().toLowerCase()
          let label = rawLabel.toLowerCase()
          label = label.replace(/\b(option|selected|selection|value|display|name|field|attribute|choice|custom)\b/g, '')
          label = label.replace(/[^a-z0-9]+/g, ' ').trim()
          if (label && label === value) return null
          if (!label) return value ? `value:${value}` : trimmed.toLowerCase()
          return `label:${label}|value:${value}`
        }
        const addDetail = (text: string) => {
          if (!shouldDisplayMetadataSegment(text)) return
          const key = canonicalDetailKey(text)
          if (!key) return
          if (detailSeen.has(key)) return
          detailSeen.add(key)
          details.push(text)
        }

        if (summary) {
          summary
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => addDetail(part))
        }

        const optionDetails = uniqueStrings([
          ...coerceStringArray(item.optionDetails),
          ...derived.optionDetails,
        ])
        optionDetails.forEach((detail) => {
          detail
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => addDetail(part))
        })

        const upgrades = uniqueStrings([
          ...coerceStringArray(item.upgrades),
          ...derived.upgrades,
        ])
        if (upgrades.length) addDetail(`Upgrades: ${upgrades.join(', ')}`)

        if (item.sku) addDetail(`SKU ${item.sku}`)

        const remainingMeta = remainingMetadataEntries(metadataEntries, derived.consumedKeys)
        const metadataInfo: string[] = []
        const metaSeen = new Set<string>()
        const addMeta = (text: string) => {
          const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
          if (!normalized) return
          if (detailSeen.has(normalized)) return
          if (metaSeen.has(normalized)) return
          metaSeen.add(normalized)
          metadataInfo.push(text)
        }

        remainingMeta.forEach((entry) => {
          const segments = formatMetadataSegments(entry.value)
          const label = formatKeyLabel(entry.key)
          segments.forEach((segment) => {
            const display = label && !segment.includes(':') ? `${label}: ${segment}` : segment
            if (shouldDisplayMetadataSegment(display)) addMeta(display)
          })
        })

        return {
          _key: item._key || item.sku || item.name || Math.random().toString(36).slice(2),
          name: rawName,
          displayName,
          sku: item.sku || null,
          quantity,
          price: typeof item.price === 'number' ? item.price : null,
          total,
          details,
          metadataInfo,
        }
      })
  }, [order?.cart])

  const addressLines = useMemo(() => {
    const addr = order?.shippingAddress
    if (!addr) return []
    const lines = [
      addr.name,
      [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', '),
      [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
      addr.country,
      [addr.email, addr.phone].filter(Boolean).join(' • '),
    ]
      .map((line) => (line ? line.trim() : ''))
      .filter(Boolean)
    return lines
  }, [order?.shippingAddress])

  const timeline = useMemo(() => {
    if (!order?.shippingLog) return []
    return order.shippingLog
      .filter((entry): entry is ShippingLogEntry => Boolean(entry))
      .map((entry) => ({
        id: entry._key || entry.createdAt || entry.status || Math.random().toString(36).slice(2),
        status: entry.status || 'update',
        message: entry.message,
        createdAt: entry.createdAt,
        trackingNumber: entry.trackingNumber,
        trackingUrl: entry.trackingUrl || entry.labelUrl || undefined,
      }))
      .sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
        return bTime - aTime
      })
  }, [order?.shippingLog])

  const statusBadges = useMemo(() => {
    if (!order) return []
    const badges: Array<{label: string; tone: 'default' | 'positive' | 'critical' | 'caution'}> = []
    if (order.status) {
      const normalized = normalizeStatusLabel(order.status)
      const manualFulfillment = Array.isArray(order.shippingLog)
        ? order.shippingLog.some(
            (entry) =>
              entry && typeof entry.status === 'string' && entry.status.toLowerCase() === 'fulfilled_manual',
          )
        : false
      const statusLabel =
        (order.status || '').toLowerCase() === 'fulfilled'
          ? manualFulfillment
            ? 'Fulfilled (Manual)'
            : 'Fulfilled (Auto)'
          : normalized
      badges.push({label: statusLabel, tone: badgeTone(statusLabel)})
    }
    if (order.paymentStatus)
      badges.push({label: `Payment: ${normalizeStatusLabel(order.paymentStatus)}`, tone: badgeTone(order.paymentStatus)})
    if (order.fulfilledAt && !badges.some((badge) => badge.label.toLowerCase().startsWith('fulfilled')))
      badges.push({label: 'Fulfilled', tone: 'positive'})
    return badges
  }, [order])

  const totals = useMemo(() => {
    if (!order) return {subtotal: 0, shipping: 0, tax: 0, total: 0}
    return {
      subtotal: order.amountSubtotal ?? 0,
      shipping: order.amountShipping ?? 0,
      tax: order.amountTax ?? 0,
      total: order.totalAmount ?? 0,
    }
  }, [order])

  const headerOrderNumber = order?.orderNumber
    ? formatOrderNumber(order.orderNumber) || order.orderNumber
    : null
  const headerTitle = headerOrderNumber ? `Order ${headerOrderNumber}` : 'Order'

  const formatDate = (value?: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  return (
    <Box
      padding={0}
      style={{
        width: '100%',
        minWidth: 0,
        borderLeft: '1px solid var(--card-border-color)',
        background: 'var(--card-background-color)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{flex: 1, overflowY: 'auto'}}>
        <div
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: '100%',
            boxSizing: 'border-box',
          }}
        >
          {!orderId ? (
            <Flex height="fill" align="center" justify="center">
              <Text muted>Select an order to preview its details.</Text>
            </Flex>
          ) : loading ? (
            <Flex height="fill" align="center" justify="center">
              <Spinner muted />
            </Flex>
          ) : error ? (
            <Card tone="critical" padding={3} radius={3} shadow={1}>
              <Text>{error}</Text>
            </Card>
          ) : !order ? (
            <Flex height="fill" align="center" justify="center">
              <Text muted>Order details unavailable.</Text>
            </Flex>
          ) : (
            <>
              <Card padding={3} radius={3} shadow={1} tone="transparent" style={{gap: 12, display: 'flex', flexDirection: 'column'}}>
                <Stack space={2}>
                  <Text size={1} muted>
                    Summary
                  </Text>
                  <Text size={2} weight="bold" style={{lineHeight: 1.2}}>
                    {headerTitle}
                  </Text>
                </Stack>
                <Flex gap={2} style={{flexWrap: 'wrap'}}>
                  {statusBadges.map((badge) => (
                    <Badge key={badge.label} tone={badge.tone} padding={2} mode="outline">
                      {badge.label}
                    </Badge>
                  ))}
                </Flex>
                <Stack space={1}>
                  {order.createdAt && (
                    <Text size={1} muted>
                      Placed {formatDate(order.createdAt)}
                    </Text>
                  )}
                  {order.fulfilledAt && (
                    <Text size={1} muted>
                      Fulfilled {formatDate(order.fulfilledAt)}
                    </Text>
                  )}
                </Stack>
                <Flex gap={8} style={{width: '100%', flexWrap: 'wrap'}}>
                  <Button
                    text="Open order"
                    tone="primary"
                    style={{flex: '1 1 140px'}}
                    onClick={() => onOpenDocument(order._id)}
                  />
                  {order.shippingLabelUrl && (
                    <Button
                      text="View label"
                      mode="ghost"
                      tone="primary"
                      style={{flex: '1 1 140px'}}
                      onClick={() => window.open(order.shippingLabelUrl!, '_blank', 'noopener')}
                    />
                  )}
                  {order.packingSlipUrl && (
                    <Button
                      text="Packing slip"
                      mode="ghost"
                      style={{flex: '1 1 140px'}}
                      onClick={() => window.open(order.packingSlipUrl!, '_blank', 'noopener')}
                    />
                  )}
                </Flex>
              </Card>

              <Card padding={3} radius={3} shadow={1} tone="transparent">
                <Stack space={3}>
                  <Text weight="semibold">Totals</Text>
                  <Grid columns={2} gap={2} style={{fontSize: 'clamp(13px, 2.5vw, 15px)'}}>
                    <Text size={1} muted>
                      Subtotal
                    </Text>
                    <Text style={{textAlign: 'right'}}>{currencyFormatter.format(totals.subtotal)}</Text>
                    <Text size={1} muted>
                      Shipping
                    </Text>
                    <Text style={{textAlign: 'right'}}>{currencyFormatter.format(totals.shipping)}</Text>
                    <Text size={1} muted>
                      Tax
                    </Text>
                    <Text style={{textAlign: 'right'}}>{currencyFormatter.format(totals.tax)}</Text>
                  </Grid>
                  <Flex
                    justify="space-between"
                    align="center"
                    style={{borderTop: '1px solid #e2e8f0', paddingTop: 8}}
                  >
                    <Text weight="semibold">Total</Text>
                    <Text weight="bold">{currencyFormatter.format(totals.total)}</Text>
                  </Flex>
                  <Stack space={1} style={{wordBreak: 'break-word'}}>
                    <Text size={1} muted>
                      Carrier: {order.shippingCarrier || 'Not set'}
                    </Text>
                    {order.trackingNumber && (
                      <Text size={1} muted>
                        Tracking: {order.trackingNumber}
                      </Text>
                    )}
                  </Stack>
                </Stack>
              </Card>

              <Card padding={3} radius={3} shadow={1} tone="transparent">
                <Stack space={2} style={{wordBreak: 'break-word'}}>
                  <Text weight="semibold">Customer</Text>
                  {order.customerName && <Text>{order.customerName}</Text>}
                  {order.customerEmail && (
                    <Text size={1} muted>
                      {order.customerEmail}
                    </Text>
                  )}
                  {addressLines.map((line) => (
                    <Text key={line} size={1} muted>
                      {line}
                    </Text>
                  ))}
                </Stack>
              </Card>

              <Card padding={3} radius={3} shadow={1} tone="transparent">
                <Stack space={2} style={{wordBreak: 'break-word'}}>
                  <Text weight="semibold">Items</Text>
                  {items.length === 0 ? (
                    <Text size={1} muted>No items recorded.</Text>
                  ) : (
                    <Stack space={3}>
                      {items.map((item) => (
                        <Stack key={item._key} space={1}>
                          <Flex
                            justify="space-between"
                            align="flex-start"
                            gap={12}
                            style={{flexWrap: 'wrap'}}
                          >
                            <Stack space={1} style={{flex: '1 1 160px', minWidth: 0}}>
                              <Text weight="semibold">{item.displayName || item.name}</Text>
                              {item.details.length > 0 && (
                                <Text size={1} muted>
                                  {item.details.join(' • ')}
                                </Text>
                              )}
                              {item.metadataInfo.length > 0 && (
                                <Stack space={1}>
                                  {item.metadataInfo.map((info, idx) => (
                                    <Text key={`${item._key}-meta-${idx}`} size={1} muted>
                                      {info}
                                    </Text>
                                  ))}
                                </Stack>
                              )}
                            </Stack>
                            <Stack
                              space={1}
                              style={{
                                minWidth: 90,
                                textAlign: 'right',
                                flex: '0 0 auto',
                              }}
                            >
                              <Text size={1} muted>
                                Qty {item.quantity}
                              </Text>
                              {typeof item.price === 'number' && (
                                <Text size={1} muted>
                                  Unit {currencyFormatter.format(item.price)}
                                </Text>
                              )}
                              {typeof item.total === 'number' && (
                                <Text weight="semibold">{currencyFormatter.format(item.total)}</Text>
                              )}
                            </Stack>
                          </Flex>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Card>

              <Card padding={3} radius={3} shadow={1} tone="transparent">
                <Stack space={2} style={{wordBreak: 'break-word'}}>
                  <Text weight="semibold">Timeline</Text>
                  {timeline.length === 0 ? (
                    <Text size={1} muted>No shipping updates yet.</Text>
                  ) : (
                    <Stack space={2}>
                      {timeline.map((entry) => (
                        <Card key={entry.id} padding={2} radius={2} tone="transparent" shadow={0}>
                          <Stack space={1}>
                            <Text weight="semibold">{normalizeStatusLabel(entry.status)}</Text>
                            {entry.message && (
                              <Text size={1} muted>
                                {entry.message}
                              </Text>
                            )}
                            {entry.trackingNumber && (
                              <Text size={1} muted>
                                Tracking {entry.trackingNumber}
                              </Text>
                            )}
                            {entry.createdAt && (
                              <Text size={1} muted>
                                {formatDate(entry.createdAt)}
                              </Text>
                            )}
                            {entry.trackingUrl && (
                              <Button
                                text="View tracking"
                                tone="primary"
                                mode="bleed"
                                onClick={() => window.open(entry.trackingUrl!, '_blank', 'noopener')}
                              />
                            )}
                          </Stack>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Card>
            </>
          )}
        </div>
      </div>
    </Box>
  )
}
