import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Avatar,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Menu,
  MenuButton,
  MenuItem,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  coerceStringArray,
  deriveOptionsFromMetadata,
  normalizeMetadataEntries,
  remainingMetadataEntries,
  shouldDisplayMetadataSegment,
  uniqueStrings,
} from '../../utils/cartItemDetails'

const API_VERSION = '2024-10-01'

function getFnBase(): string {
  const envBase = (typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined) as
    | string
    | undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('NLFY_BASE')
      if (stored) return stored
    } catch {
      // ignore storage access issues
    }
    const origin = window.location?.origin
    if (origin && /^https?:/i.test(origin)) return origin
  }
  return ''
}

type DocumentViewProps = {
  document?: {
    displayed?: OrderDocument | null
    draft?: OrderDocument | null
    published?: OrderDocument | null
  }
  schemaType?: unknown
}

type SanityReference = {
  _type: 'reference'
  _ref: string
}

type OrderAddress = {
  name?: string
  phone?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

type OrderCartItem = {
  _key?: string
  name?: string
  sku?: string
  quantity?: number
  price?: number
  lineTotal?: number
  optionSummary?: string
  optionDetails?: string[] | string | null
  upgrades?: string[] | string | null
  metadata?: Array<{key?: string; value?: string}>
}

type ShippingLogEntry = {
  _key?: string
  status?: string
  message?: string
  labelUrl?: string
  trackingUrl?: string
  trackingNumber?: string
  weight?: number
  createdAt?: string
}

type OrderDocument = {
  _id: string
  orderNumber?: string
  status?: string
  paymentStatus?: string
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  amountShipping?: number
  shippingCarrier?: string
  trackingNumber?: string
  trackingUrl?: string
  shippingLabelUrl?: string
  packingSlipUrl?: string
  shipStationOrderId?: string
  fulfilledAt?: string
  createdAt?: string
  customerEmail?: string
  customerName?: string
  shippingAddress?: OrderAddress
  cart?: OrderCartItem[]
  invoiceRef?: SanityReference | {_ref?: string}
  shippingLog?: ShippingLogEntry[]
  selectedService?: {
    serviceCode?: string
    carrierId?: string
    carrier?: string
    service?: string
    amount?: number
    currency?: string
    deliveryDays?: number
  }
}

type InvoiceDocument = {
  _id: string
  invoiceNumber?: string
  status?: string
}

type TimelineEntry = {
  id: string
  title: string
  subtitle?: string
  timestampLabel?: string
  tone: 'default' | 'positive' | 'critical' | 'caution'
  href?: string
}

type SummaryTokenTone = 'default' | 'positive' | 'critical' | 'caution'

const CODE_FONT_FAMILY =
  "var(--font-family-code, var(--font-family-mono, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace))"

const SUMMARY_TOKEN_BASE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid var(--card-border-color)',
  backgroundColor: 'var(--card-muted-bg-color)',
  color: 'var(--card-fg-color)',
  fontFamily: CODE_FONT_FAMILY,
  fontSize: 12,
  lineHeight: 1.4,
  boxSizing: 'border-box',
  maxWidth: '100%',
  minWidth: 0,
  wordBreak: 'break-word',
  gap: 6,
}

const SUMMARY_TONE_ACCENTS: Record<SummaryTokenTone, string | null> = {
  default: null,
  positive: 'var(--card-badge-positive-bg-color, var(--card-border-color))',
  critical: 'var(--card-badge-critical-bg-color, var(--card-border-color))',
  caution: 'var(--card-badge-caution-bg-color, var(--card-border-color))',
}

function SummaryToken({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: SummaryTokenTone
}) {
  const accent = SUMMARY_TONE_ACCENTS[tone]
  const style = accent
    ? {...SUMMARY_TOKEN_BASE_STYLE, boxShadow: `inset 3px 0 0 0 ${accent}`}
    : SUMMARY_TOKEN_BASE_STYLE

  return (
    <Box style={style}>
      <Text
        size={1}
        weight="medium"
        style={{
          fontFamily: 'inherit',
          color: 'inherit',
          display: 'inline',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </Text>
    </Box>
  )
}

const money = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

const preferValue = <T,>(...values: Array<T | null | undefined>): T | undefined => {
  for (const value of values) {
    if (value !== null && value !== undefined) return value
  }
  return undefined
}

const formatKeyLabel = (label: string): string =>
  label
    .replace(/[_-]+/g, ' ')
    .replace(/\w\S*/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1))

const formatMetadataSegments = (value: unknown): string[] => {
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
        lines.push(`Price: ${money(Number(priceValue))}`)
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

const normalizeAddress = (source?: OrderAddress | null): string[] | null => {
  if (!source) {
    return null
  }
  const {name, phone, email, addressLine1, addressLine2, city, state, postalCode, country} = source
  const rawLines = [
    name || '',
    [addressLine1, addressLine2].filter(Boolean).join(', '),
    [city, state, postalCode].filter(Boolean).join(', '),
    country || '',
    [email || '', phone || ''].filter(Boolean).join(' • '),
  ]

  const cleanLines = rawLines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => !!line)

  return cleanLines.length ? cleanLines : null
}

const badgeTone = (status?: string) => {
  if (!status) return 'default'
  switch (status.toLowerCase()) {
    case 'paid':
    case 'fulfilled':
    case 'succeeded':
    case 'delivered':
      return 'positive'
    case 'processing':
    case 'pending':
    case 'label_created':
      return 'caution'
    case 'cancelled':
    case 'canceled':
    case 'failed':
    case 'refunded':
      return 'critical'
    default:
      return 'default'
  }
}

const formatDate = (value?: string | null, opts?: Intl.DateTimeFormatOptions) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: opts?.timeStyle ?? 'short',
    ...(opts || {}),
  })
}

const normalizeStatusLabel = (value?: string | null) => {
  if (!value) return 'Pending'
  return value
    .split(/\s+/)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

const orderFromProps = (props: DocumentViewProps['document']): OrderDocument | null => {
  if (!props) return null
  return (
    (props.displayed as OrderDocument | undefined) ||
    (props.draft as OrderDocument | undefined) ||
    (props.published as OrderDocument | undefined) ||
    null
  )
}

const FULFILL_ENDPOINT = '/.netlify/functions/fulfill-order'
const PACKING_SLIP_ENDPOINT = '/.netlify/functions/generatePackingSlips'
const INVOICE_PDF_ENDPOINT = '/.netlify/functions/generateInvoicePDF'

function OrderDetailView(props: DocumentViewProps) {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const fnBaseRef = useRef<string>(getFnBase())

  const initialOrder = useMemo(() => orderFromProps(props.document), [props.document])
  const [order, setOrder] = useState<OrderDocument | null>(initialOrder)
  const [invoiceDoc, setInvoiceDoc] = useState<InvoiceDocument | null>(null)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fulfillmentLoading, setFulfillmentLoading] = useState(false)
  const [packingLoading, setPackingLoading] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  useEffect(() => {
    setOrder(initialOrder)
  }, [initialOrder])

  const orderId = useMemo(
    () => (order?._id ? order._id.replace(/^drafts\./, '') : undefined),
    [order?._id]
  )

  useEffect(() => {
    let cancelled = false
    if (!order) {
      setInvoiceDoc(null)
      return () => {
        cancelled = true
      }
    }

    const invoiceRefId =
      order.invoiceRef && typeof order.invoiceRef === 'object' ? order.invoiceRef._ref : undefined
    const payload = {
      invoiceId: invoiceRefId || '',
      orderId: orderId || '',
      orderNumber: order.orderNumber || '',
    }

    async function loadInvoice() {
      if (!payload.invoiceId && !payload.orderId && !payload.orderNumber) {
        setInvoiceDoc(null)
        return
      }
      try {
        const doc = await client.fetch<InvoiceDocument | null>(
          `*[_type == "invoice" && (
            (_id == $invoiceId && $invoiceId != '') ||
            (orderRef._ref == $orderId && $orderId != '') ||
            (orderNumber == $orderNumber && $orderNumber != '') ||
            (invoiceNumber == $orderNumber && $orderNumber != '')
          )] | order(_updatedAt desc)[0]{_id, invoiceNumber, status}`,
          payload
        )
        if (!cancelled) {
          setInvoiceDoc(doc || null)
          if (!invoiceRefId && doc?._id && order?._id) {
            client
              .patch(order._id)
              .set({invoiceRef: {_type: 'reference', _ref: doc._id}})
              .commit({autoGenerateArrayKeys: true})
              .catch(() => undefined)
          }
        }
      } catch {
        if (!cancelled) setInvoiceDoc(null)
      }
    }

    loadInvoice()

    return () => {
      cancelled = true
    }
  }, [client, order, orderId])

  const refreshOrder = useCallback(async () => {
    if (!orderId) return
    setRefreshing(true)
    try {
      const next = await client.fetch<OrderDocument>(
        `*[_type == "order" && _id == $id][0]{
          _id,
          orderNumber,
          status,
          paymentStatus,
          totalAmount,
          amountSubtotal,
          amountTax,
          amountShipping,
          shippingCarrier,
          trackingNumber,
          trackingUrl,
          shippingLabelUrl,
          packingSlipUrl,
          fulfilledAt,
          createdAt,
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
          invoiceRef,
          shippingLog[]{_key,status,message,labelUrl,trackingUrl,trackingNumber,weight,createdAt},
          selectedService{
            serviceCode,
            carrierId,
            carrier,
            service,
            amount,
            currency,
            deliveryDays
          }
        }`,
        {id: orderId}
      )
      setOrder(next || null)
    } catch (err: any) {
      console.error('OrderDetailView refresh failed', err)
      toast.push({
        status: 'error',
        title: 'Failed to refresh order',
        description: err?.message || 'Unable to fetch the latest order data.',
      })
    } finally {
      setRefreshing(false)
    }
  }, [client, orderId, toast])

  useEffect(() => {
    if (!orderId) return
    const subscription = client
      .listen(
        `*[_type == "order" && _id == $id]`,
        {id: orderId},
        {visibility: 'query', tag: 'order-detail-view'}
      )
      .subscribe(() => {
        refreshOrder()
      })
    return () => {
      try {
        subscription.unsubscribe()
      } catch {
        // ignore unsubscribe errors
      }
    }
  }, [client, orderId, refreshOrder])

  const lineItems = useMemo(() => {
    if (!order?.cart || !Array.isArray(order.cart) || order.cart.length === 0) return []
    return order.cart.map((item) => {
      const quantity = preferValue(Number(item.quantity), 1) || 1
      const unitPrice = preferValue(
        typeof item.price === 'number' ? item.price : undefined,
        typeof item.lineTotal === 'number' && quantity ? item.lineTotal / quantity : undefined
      )
      const explicitTotal = typeof item.lineTotal === 'number' ? item.lineTotal : undefined
      const total = explicitTotal ?? (typeof unitPrice === 'number' ? unitPrice * quantity : undefined)

      const metadataEntries = normalizeMetadataEntries(item.metadata || [])
      const rawName = (item.name || item.sku || 'Item').toString()
      const displayName = rawName.split('•')[0]?.trim() || rawName
      const derived = deriveOptionsFromMetadata(metadataEntries)
      const summary = item.optionSummary?.trim() || derived.optionSummary
      const detailParts: string[] = []
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
        detailParts.push(text)
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
      const metaLabels: string[] = []
      const metaSeen = new Set<string>()
      const addMeta = (text: string) => {
        const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
        if (!normalized) return
        if (detailSeen.has(normalized)) return
        if (metaSeen.has(normalized)) return
        metaSeen.add(normalized)
        metaLabels.push(text)
      }
      remainingMeta.forEach((entry) => {
        const rawSegments = formatMetadataSegments(entry.value)
        const label = formatKeyLabel(entry.key)
        rawSegments.forEach((segment) => {
          const display =
            label && !segment.includes(':') ? `${label}: ${segment}` : segment
          if (shouldDisplayMetadataSegment(display)) addMeta(display)
        })
      })

      return {
        _key: item._key || item.sku || item.name || Math.random().toString(36).slice(2),
        name: rawName,
        displayName,
        quantity,
        unitPrice,
        total,
        details: detailParts.filter(Boolean),
        metaLabels,
      }
    })
  }, [order?.cart])

  const totals = useMemo(() => {
    const subtotal =
      order?.amountSubtotal ??
      lineItems.reduce((sum, item) => {
        return sum + (typeof item.total === 'number' ? item.total : 0)
      }, 0)
    const shipping = order?.amountShipping ?? 0
    const tax = order?.amountTax ?? 0
    const grandTotal = order?.totalAmount ?? subtotal + shipping + tax
    return {subtotal, shipping, tax, total: grandTotal}
  }, [lineItems, order?.amountShipping, order?.amountSubtotal, order?.amountTax, order?.totalAmount])

  const hasTracking = Boolean(order?.trackingNumber)
  const isFulfilled = Boolean(order?.fulfilledAt)

  const statusBadges = useMemo(() => {
    if (!order) return []
    const badges: Array<{label: string; tone: 'default' | 'positive' | 'critical' | 'caution'}> = []
    if (order.status) badges.push({label: normalizeStatusLabel(order.status), tone: badgeTone(order.status)})
    if (order.paymentStatus)
      badges.push({label: `Payment: ${normalizeStatusLabel(order.paymentStatus)}`, tone: badgeTone(order.paymentStatus)})
    if (order.fulfilledAt) badges.push({label: 'Fulfilled', tone: 'positive'})
    return badges
  }, [order])

  const locationLabel = useMemo(() => {
    if (!order?.shippingAddress) return null
    const {city, state, country} = order.shippingAddress
    const pieces = [city, state, country].filter(Boolean)
    return pieces.length ? pieces.join(', ') : null
  }, [order?.shippingAddress])

    const timelineEntries = useMemo<TimelineEntry[]>(() => {
      const entries: TimelineEntry[] = []
    const logItems = Array.isArray(order?.shippingLog) ? order!.shippingLog : []
    logItems
      .map((entry) => ({
        ...entry,
        createdAt: entry?.createdAt || null,
        status: entry?.status || '',
      }))
      .sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
        return bTime - aTime
      })
      .forEach((entry, index) => {
        const statusLabel = normalizeStatusLabel(entry.status)
        const tone = badgeTone(entry.status)
        const label = entry.message ? `${statusLabel} • ${entry.message}` : statusLabel
        entries.push({
          id: entry._key || `${entry.status || 'event'}-${index}`,
          title: label,
          subtitle: entry.trackingNumber ? `Tracking ${entry.trackingNumber}` : undefined,
          timestampLabel: formatDate(entry.createdAt) || undefined,
          tone,
          href: entry.trackingUrl || entry.labelUrl || undefined,
        })
      })

    if (order?.fulfilledAt) {
      const exists = entries.some((entry) => entry.title.toLowerCase().includes('fulfilled'))
      if (!exists) {
        entries.unshift({
          id: 'fulfilled-at',
          title: 'Order fulfilled',
          timestampLabel: formatDate(order.fulfilledAt) || undefined,
          tone: 'positive',
        })
      }
    }

    if (order?.createdAt) {
      entries.push({
        id: 'created-at',
        title: 'Order placed',
        timestampLabel: formatDate(order.createdAt) || undefined,
        tone: 'default',
      })
    }

      return entries
    }, [order])

  const baseUrl = fnBaseRef.current || ''
  const fulfillmentEndpoint = baseUrl ? `${baseUrl}${FULFILL_ENDPOINT}` : FULFILL_ENDPOINT
  const packingEndpoint = baseUrl ? `${baseUrl}${PACKING_SLIP_ENDPOINT}` : PACKING_SLIP_ENDPOINT

  const headerTitle = useMemo(() => {
    if (!order) return 'Order'
    if (order.orderNumber) return `Order ${order.orderNumber}`
    if (order._id) return `Order ${order._id.slice(-6)}`
    return 'Order'
  }, [order])

  const handleFulfillOrder = useCallback(async () => {
    if (!orderId) return
    setFulfillmentLoading(true)
    try {
      const res = await fetch(fulfillmentEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          orderId,
          useExistingTracking: hasTracking,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || (json && json.success === false)) {
        throw new Error(json?.error || 'Fulfillment request failed')
      }

      const message = typeof json?.message === 'string' ? json.message.trim() : ''
      const installOnly = Boolean(json?.installOnly)
      const freightRequired = Boolean(json?.freight)
      const trackingNumber = typeof json?.trackingNumber === 'string' ? json.trackingNumber.trim() : ''
      const trackingUrl = typeof json?.trackingUrl === 'string' ? json.trackingUrl.trim() : ''
      const installOnlySkus = Array.isArray(json?.installOnlySkus)
        ? json.installOnlySkus.map((sku: unknown) => (typeof sku === 'string' ? sku.trim() : '')).filter(Boolean)
        : []

      const infoSegments: string[] = []
      if (message) infoSegments.push(message)
      if (trackingNumber && !message.includes(trackingNumber)) {
        infoSegments.push(
          trackingUrl ? `Tracking ${trackingNumber} → ${trackingUrl}` : `Tracking ${trackingNumber}`
        )
      }
      if (installOnlySkus.length) {
        infoSegments.push(`Install-only SKUs: ${installOnlySkus.join(', ')}`)
      }

      const descriptionFallback = hasTracking
        ? 'Marked as fulfilled and sent tracking details to the customer.'
        : 'Shipping label generation started. This view will refresh automatically once processing finishes.'

      let status: 'success' | 'warning' = 'success'
      let title = hasTracking ? 'Order fulfilled' : 'Fulfillment in progress'

      if (installOnly) {
        status = 'warning'
        title = 'Installation required'
        if (!infoSegments.length) {
          infoSegments.push('This order only requires scheduling installation instead of shipping.')
        }
      } else if (freightRequired) {
        status = 'warning'
        title = 'Freight quote requested'
        if (!infoSegments.length) {
          infoSegments.push('Freight is required—check the freight queue for next steps.')
        }
      }

      toast.push({
        status,
        title,
        description: infoSegments.length ? infoSegments.join(' • ') : descriptionFallback,
      })
      await refreshOrder()
    } catch (err: any) {
      console.error('Fulfill order failed', err)
      toast.push({
        status: 'error',
        title: 'Could not generate label',
        description: err?.message || 'Check the browser console or Netlify logs for details.',
      })
    } finally {
      setFulfillmentLoading(false)
    }
  }, [fulfillmentEndpoint, hasTracking, orderId, refreshOrder, toast])

  const handleDownloadPackingSlip = useCallback(async () => {
    if (!orderId) return
    setPackingLoading(true)
    try {
      const res = await fetch(packingEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({orderId}),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Packing slip generation failed')
      }
      const arrayBuffer = await res.arrayBuffer()
      const blob = new Blob([arrayBuffer], {type: res.headers.get('content-type') || 'application/pdf'})
      const url = URL.createObjectURL(blob)
      try {
        window.open(url, '_blank', 'noopener')
      } catch {
        window.location.href = url
      }
    } catch (err: any) {
      console.error('Packing slip download failed', err)
      toast.push({
        status: 'error',
        title: 'Packing slip unavailable',
        description: err?.message || 'Unable to generate packing slip.',
      })
    } finally {
      setPackingLoading(false)
    }
  }, [orderId, packingEndpoint, toast])

  const handleDownloadInvoice = useCallback(async () => {
    if (!invoiceDoc?._id) return
    setInvoiceLoading(true)
    try {
      const res = await fetch(INVOICE_PDF_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ invoiceId: invoiceDoc._id }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Invoice generation failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      try {
        window.open(url, '_blank', 'noopener')
      } catch {
        window.location.href = url
      }
    } catch (err: any) {
      console.error('Invoice download failed', err)
      toast.push({
        status: 'error',
        title: 'Invoice unavailable',
        description: err?.message || 'Unable to generate invoice PDF.',
      })
    } finally {
      setInvoiceLoading(false)
    }
  }, [invoiceDoc?._id, toast])

  const invoiceRefId = order?.invoiceRef && typeof order.invoiceRef === 'object' ? order.invoiceRef._ref : undefined

  const createInvoiceFromOrder = useCallback(async () => {
    if (!order) return
    if (creatingInvoice) return
    if (invoiceRefId) {
      router.navigateIntent('edit', {id: invoiceRefId, type: 'invoice'})
      return
    }
    setCreatingInvoice(true)
    try {
      const lineItemsForInvoice = (order.cart || []).map((item) => ({
        _type: 'invoiceLineItem',
        kind: 'custom',
        description: item.name || item.sku || 'Item',
        sku: item.sku,
        quantity: preferValue(Number(item.quantity), 1) || 1,
        unitPrice: typeof item.price === 'number' ? item.price : undefined,
        lineTotal: typeof item.lineTotal === 'number' ? item.lineTotal : undefined,
        optionSummary: item.optionSummary,
        optionDetails: Array.isArray(item.optionDetails) ? item.optionDetails : undefined,
        upgrades: Array.isArray(item.upgrades) ? item.upgrades : undefined,
      }))

      const sanitizeAddress = (addr?: OrderAddress | null) => {
        if (!addr) return undefined
        return {
          name: addr.name || '',
          phone: addr.phone || '',
          email: addr.email || order.customerEmail || '',
          address_line1: addr.addressLine1 || '',
          address_line2: addr.addressLine2 || '',
          city_locality: addr.city || '',
          state_province: addr.state || '',
          postal_code: addr.postalCode || '',
          country_code: addr.country || '',
        }
      }

      const payload = {
        _type: 'invoice',
        status: 'pending',
        orderNumber: order.orderNumber || '',
        orderRef: {_type: 'reference', _ref: order._id},
        billTo: sanitizeAddress(order.shippingAddress),
        shipTo: sanitizeAddress(order.shippingAddress),
        customerEmail: order.customerEmail || '',
        lineItems: lineItemsForInvoice,
        taxRate: 0,
        discountType: 'amount' as const,
        discountValue: 0,
      }

      const created = await client.create(payload, {autoGenerateArrayKeys: true})

      await client
        .patch(order._id)
        .set({invoiceRef: {_type: 'reference', _ref: created._id}})
        .commit({autoGenerateArrayKeys: true})

      toast.push({
        status: 'success',
        title: 'Invoice created',
        description: 'Opened invoice based on this order.',
      })

      router.navigateIntent('edit', {id: created._id, type: 'invoice'})
    } catch (err: any) {
      console.error('OrderDetailView: invoice creation failed', err)
      toast.push({
        status: 'error',
        title: 'Could not create invoice',
        description: err?.message || 'Check console for details',
      })
    } finally {
      setCreatingInvoice(false)
    }
  }, [client, creatingInvoice, invoiceRefId, order, router, toast])

  if (!order) {
    return (
      <Card padding={4} margin={4} tone="transparent">
        <Text size={2}>Order data not available.</Text>
      </Card>
    )
  }

  const selectedServiceSummary = order.selectedService
    ? [order.selectedService.carrier, order.selectedService.service]
        .filter(Boolean)
        .join(' • ')
    : null

  return (
    <Box padding={4} style={{backgroundColor: '#f3f4f6', height: '100%', overflow: 'auto'}}>
      <Stack space={4}>
        <Card padding={4} radius={4} shadow={1} style={{backgroundColor: '#ffffff'}}>
          <Flex
            align={['stretch', 'center']}
            justify="space-between"
            gap={4}
            style={{flexWrap: 'wrap'}}
          >
            <Stack space={3} style={{minWidth: '260px'}}>
              <Heading size={3}>{headerTitle}</Heading>
              <Flex gap={2} style={{flexWrap: 'wrap'}}>
                {statusBadges.map((badge) => (
                  <SummaryToken key={badge.label} tone={badge.tone}>
                    {badge.label}
                  </SummaryToken>
                ))}
                {locationLabel && <SummaryToken>{locationLabel}</SummaryToken>}
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
            </Stack>
            <Flex gap={3} align="center" style={{flexWrap: 'wrap'}}>
              {refreshing && (
                <Flex align="center" gap={2}>
                  <Spinner muted />
                  <Text size={1} muted>
                    Updating…
                  </Text>
                </Flex>
              )}
              <Button text="Refresh" mode="ghost" onClick={refreshOrder} disabled={refreshing} />
              <MenuButton
                id="order-detail-menu"
                button={<Button text="More actions" mode="ghost" />}
                menu={
                  <Menu>
                    <MenuItem
                      text="Open editable form"
                      onClick={() =>
                        router.navigateIntent('edit', {
                          id: order._id,
                          type: 'order',
                        })
                      }
                    />
                    {order.shipStationOrderId && (
                      <MenuItem
                        text="Open ShipStation"
                        onClick={() => {
                          const url = `https://ss3.shipstation.com/orders/${order.shipStationOrderId}`
                          window.open(url, '_blank', 'noopener')
                        }}
                      />
                    )}
                  </Menu>
                }
              />
            </Flex>
          </Flex>
        </Card>

        <Flex direction={['column', 'column', 'row']} gap={4} align="stretch">
          <Stack space={4} flex={2} style={{minWidth: 0}}>
            <Card padding={4} radius={4} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={3}>
                <Flex justify="space-between" align="center">
                  <Heading size={2}>Fulfillment timeline</Heading>
                  {order.trackingNumber && (
                    <SummaryToken tone="positive">Tracking {order.trackingNumber}</SummaryToken>
                  )}
                </Flex>
                {timelineEntries.length === 0 ? (
                  <Text size={1} muted>
                    No fulfillment updates yet.
                  </Text>
                ) : (
                  <Stack space={3}>
                    {timelineEntries.map((entry) => (
                      <Flex key={entry.id} gap={3} align="flex-start">
                        <Box
                          style={{
                            marginTop: 4,
                            width: 16,
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <Box
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '999px',
                              backgroundColor:
                                entry.tone === 'positive'
                                  ? '#10b981'
                                  : entry.tone === 'critical'
                                  ? '#ef4444'
                                  : entry.tone === 'caution'
                                  ? '#facc15'
                                  : '#cbd5f5',
                            }}
                          />
                        </Box>
                        <Stack space={1} style={{flex: 1}}>
                          <Text weight="semibold">{entry.title}</Text>
                          {entry.subtitle && (
                            <Text size={1} muted>
                              {entry.subtitle}
                            </Text>
                          )}
                          {entry.timestampLabel && (
                            <Text size={1} muted>
                              {entry.timestampLabel}
                            </Text>
                          )}
                          {entry.href && (
                            <Button
                              text="View details"
                              tone="primary"
                              mode="bleed"
                              onClick={() => window.open(entry.href, '_blank', 'noopener')}
                            />
                          )}
                        </Stack>
                      </Flex>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>

            <Card padding={4} radius={4} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={3}>
                <Heading size={2}>Customer</Heading>
                {order.customerName && <Text weight="semibold">{order.customerName}</Text>}
                {order.customerEmail && (
                  <Text size={1} muted>
                    {order.customerEmail}
                  </Text>
                )}
                {normalizeAddress(order.shippingAddress)?.map((line) => (
                  <Text key={line} size={1} muted>
                    {line}
                  </Text>
                ))}
              </Stack>
            </Card>
          </Stack>

          <Stack space={4} flex={1} style={{minWidth: '260px'}}>
            <Card padding={4} radius={4} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={3}>
                <Heading size={2}>Fulfillment actions</Heading>
                <Button
                  text={
                    hasTracking
                      ? isFulfilled
                        ? 'Resend tracking email'
                        : 'Mark fulfilled & notify customer'
                      : order.shippingLabelUrl
                      ? 'Regenerate label & notify customer'
                      : 'Create shipping label & notify customer'
                  }
                  tone="primary"
                  onClick={handleFulfillOrder}
                  disabled={fulfillmentLoading}
                  loading={fulfillmentLoading}
                />
                <Button
                  text={packingLoading ? 'Generating packing slip…' : 'Download packing slip'}
                  mode="ghost"
                  tone="primary"
                  onClick={handleDownloadPackingSlip}
                  disabled={packingLoading}
                />
                {order.shippingLabelUrl && (
                  <Button
                    text="Open shipping label"
                    tone="primary"
                    mode="bleed"
                    onClick={() => window.open(order.shippingLabelUrl!, '_blank', 'noopener')}
                  />
                )}
                {invoiceDoc ? (
                  <Stack space={2}>
                    <Button
                      text="View invoice"
                      tone="default"
                      onClick={() => router.navigateIntent('edit', {id: invoiceDoc._id, type: 'invoice'})}
                    />
                    <Button
                      text={invoiceLoading ? 'Preparing invoice…' : 'Download invoice'}
                      tone="default"
                      mode="ghost"
                      disabled={invoiceLoading}
                      onClick={handleDownloadInvoice}
                    />
                  </Stack>
                ) : (
                  <Button
                    text={creatingInvoice ? 'Creating invoice…' : 'Create invoice'}
                    tone="default"
                    onClick={createInvoiceFromOrder}
                    disabled={creatingInvoice}
                    loading={creatingInvoice}
                  />
                )}
              </Stack>
            </Card>

            <Card padding={4} radius={4} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={4}>
                <Heading size={2}>Order summary</Heading>
                <Grid columns={[1, 1, 2]} gap={3}>
                  <Text muted>Subtotal</Text>
                  <Text style={{textAlign: 'right'}}>{money(totals.subtotal)}</Text>
                  <Text muted>Shipping</Text>
                  <Text style={{textAlign: 'right'}}>{money(totals.shipping)}</Text>
                  <Text muted>Tax</Text>
                  <Text style={{textAlign: 'right'}}>{money(totals.tax)}</Text>
                </Grid>
                <Box paddingTop={3} style={{borderTop: '1px solid #e2e8f0'}}>
                  <Flex justify="space-between" align="center">
                    <Text weight="semibold">Total</Text>
                    <Text weight="bold">{money(totals.total)}</Text>
                  </Flex>
                </Box>
                <Stack space={2}>
                  <Text muted>Carrier: {order.shippingCarrier || 'Not set'}</Text>
                  {selectedServiceSummary && (
                    <Text muted>Rate: {selectedServiceSummary}</Text>
                  )}
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Flex>

        <Card padding={4} radius={4} shadow={1} style={{backgroundColor: '#ffffff'}}>
          <Stack space={3}>
            <Heading size={2}>Items</Heading>
            {lineItems.length === 0 ? (
              <Text size={1} muted>
                No cart items recorded for this order.
              </Text>
            ) : (
              <Stack space={3}>
                {lineItems.map((item) => (
                  <Flex
                    key={item._key}
                    align="center"
                    gap={4}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <Avatar initials={(item.displayName || item.name).slice(0, 2).toUpperCase()} size={3} />
                    <Stack space={2} style={{flex: 1, minWidth: 0}}>
                      <Text weight="semibold">{item.displayName || item.name}</Text>
                      {item.details.length > 0 && (
                        <Text size={1} muted>
                          {item.details.join(' • ')}
                        </Text>
                      )}
                      {item.metaLabels.length > 0 && (
                        <Flex gap={2} style={{flexWrap: 'wrap'}}>
                          {item.metaLabels.map((meta) => (
                            <SummaryToken key={meta}>{meta}</SummaryToken>
                          ))}
                        </Flex>
                      )}
                    </Stack>
                    <Stack space={1} style={{minWidth: 120, textAlign: 'right'}}>
                      <Text size={1} muted>
                        Qty {item.quantity}
                      </Text>
                      {typeof item.unitPrice === 'number' && (
                        <Text size={1} muted>
                          Unit {money(item.unitPrice)}
                        </Text>
                      )}
                      {typeof item.total === 'number' && <Text weight="semibold">{money(item.total)}</Text>}
                    </Stack>
                  </Flex>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}

export default OrderDetailView
