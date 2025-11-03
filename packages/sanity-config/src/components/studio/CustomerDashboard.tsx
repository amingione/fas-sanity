import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {Button, Card, Dialog, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {format, formatDistanceToNow, parseISO} from 'date-fns'
import {formatOrderNumber} from '../../utils/orderNumber'
import {filterOutExpiredOrders, GROQ_FILTER_EXCLUDE_EXPIRED} from '../../utils/orderFilters'

type BasicAddress = {
  name?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

type CustomerOrderSummary = {
  orderNumber?: string | null
  status?: string | null
  orderDate?: string | null
  total?: number | null
}

type CustomerQuoteSummary = {
  quoteNumber?: string | null
  status?: string | null
  createdAt?: string | null
}

type OrderCartItemMeta = {
  key?: string | null
  value?: string | null
  source?: string | null
}

type OrderCartItem = {
  _key?: string
  name?: string | null
  quantity?: number | null
  price?: number | null
  lineTotal?: number | null
  metadata?: OrderCartItemMeta[] | null
}

type OrderDocumentLite = {
  _id: string
  orderNumber?: string | null
  status?: string | null
  paymentStatus?: string | null
  createdAt?: string | null
  _createdAt?: string | null
  totalAmount?: number | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  cardBrand?: string | null
  cardLast4?: string | null
  cart?: OrderCartItem[] | null
}

type PaymentMethodSummary = {
  key: string
  brand: string
  last4: string
  orderCount: number
  lastUsed: Date | null
}

type StoreCreditTransaction = {
  id: string
  orderNumber?: string | null
  amount: number
  occurredAt: Date | null
}

type StoreCreditSummary = {
  totalRedeemed: number
  transactions: StoreCreditTransaction[]
}

const normalizeOrderNumberValue = (value?: string | null): string | null => {
  const formatted = formatOrderNumber(value)
  if (formatted) return formatted
  const trimmed = typeof value === 'string' ? value.trim() : value ? String(value).trim() : ''
  return trimmed ? trimmed : null
}

type CustomerRecord = {
  _id: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  emailOptIn?: boolean
  marketingOptIn?: boolean
  shippingAddress?: {
    city?: string
    state?: string
    country?: string
  } | null
  address?: string | null
  orderCount?: number | null
  lifetimeSpend?: number | null
  displayName?: string
  location?: string
}

type CustomerDetail = CustomerRecord & {
  phone?: string | null
  textOptIn?: boolean | null
  shippingAddress?: BasicAddress | null
  billingAddress?: BasicAddress | null
  orders?: CustomerOrderSummary[] | null
  quotes?: CustomerQuoteSummary[] | null
  roles?: string[] | null
  quoteCount?: number | null
  updatedAt?: string | null
  _createdAt?: string | null
  orderDocuments?: OrderDocumentLite[] | null
  stripePaymentMethods?: StripePaymentMethodRecord[] | null
}

type StripePaymentMethodRecord = {
  id?: string | null
  type?: string | null
  brand?: string | null
  last4?: string | null
  expMonth?: number | null
  expYear?: number | null
  funding?: string | null
  wallet?: string | null
  createdAt?: string | null
  isDefault?: boolean | null
}

type CustomerPreview = {
  _id: string
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  shippingAddress?: BasicAddress | null
  billingAddress?: BasicAddress | null
  orderCount?: number | null
  lifetimeSpend?: number | null
  roles?: string[] | null
}

type CustomerResponse = {
  stats: {
    customerCount: number
  }
  customers: CustomerRecord[]
}

type TimelineEntry = {
  id: string
  title: string
  description: string
  timeLabel?: string | null
}

type TimelineSection = {
  dateLabel: string
  entries: TimelineEntry[]
}

const CUSTOMER_QUERY = `{
  "stats": {
    "customerCount": count(*[_type == "customer"])
  },
  "customers": *[_type == "customer"] | order(coalesce(name, firstName + " " + lastName, email) asc)[0...250]{
    _id,
    firstName,
    lastName,
    name,
    email,
    emailOptIn,
    marketingOptIn,
    shippingAddress{
      city,
      state,
      country
    },
    address,
    orderCount,
    lifetimeSpend
  }
}`

const CUSTOMER_DETAIL_QUERY = `*[_type == "customer" && _id == $id][0]{
  _id,
  firstName,
  lastName,
  name,
  email,
  phone,
  emailOptIn,
  marketingOptIn,
  textOptIn,
  shippingAddress{
    name,
    street,
    city,
    state,
    postalCode,
    country
  },
  billingAddress{
    name,
    street,
    city,
    state,
    postalCode,
    country
  },
  address,
  roles,
  orders[]{
    orderNumber,
    status,
    orderDate,
    total
  },
  quotes[]{
    quoteNumber,
    status,
    createdAt
  },
  stripePaymentMethods[]{
    id,
    type,
    brand,
    last4,
    expMonth,
    expYear,
    funding,
    wallet,
    createdAt,
    isDefault
  },
  "orderDocuments": *[
    _type == "order" &&
    (${GROQ_FILTER_EXCLUDE_EXPIRED}) &&
    (
      customerRef._ref == ^._id ||
      customer._ref == ^._id ||
      (defined(^.email) && defined(customerEmail) && lower(customerEmail) == lower(^.email))
    )
  ] | order(coalesce(createdAt, _createdAt) desc)[0...50]{
    _id,
    orderNumber,
    status,
    paymentStatus,
    createdAt,
    _createdAt,
    totalAmount,
    amountSubtotal,
    amountTax,
    amountShipping,
    cardBrand,
    cardLast4,
    cart[]{
      _key,
      name,
      quantity,
      price,
      lineTotal,
      metadata[]{
        key,
        value,
        source
      }
    }
  },
  orderCount,
  quoteCount,
  lifetimeSpend,
  updatedAt,
  _createdAt
}`

const CUSTOMER_PREVIEW_QUERY = `*[_type == "customer" && _id == $id][0]{
  _id,
  firstName,
  lastName,
  name,
  email,
  phone,
  shippingAddress{
    name,
    street,
    city,
    state,
    postalCode,
    country
  },
  billingAddress{
    name,
    street,
    city,
    state,
    postalCode,
    country
  },
  orderCount,
  lifetimeSpend,
  roles
}`

const buildDisplayName = (customer: CustomerRecord) => {
  const legacy = customer.name?.trim()
  const composed = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
  return legacy || composed || customer.email || 'Unnamed customer'
}

const buildLocation = (customer: CustomerRecord) => {
  const address = customer.shippingAddress
  const parts = [address?.city, address?.state, address?.country].filter(Boolean)
  if (parts.length > 0) {
    return parts.join(', ')
  }
  if (customer.address) {
    const condensed = customer.address.split(/\n|,/).map((piece) => piece.trim()).filter(Boolean)
    if (condensed.length > 0) {
      return condensed[0]
    }
  }
  return '—'
}

const formatOrders = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '0 orders'
  if (value === 1) return '1 order'
  return `${value} orders`
}

const formatCurrency = (value: number | null | undefined) => {
  const amount = value ?? 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}

const getSubscriptionStatus = (customer: CustomerRecord) => {
  if (customer.marketingOptIn || customer.emailOptIn) {
    return 'Subscribed'
  }
  return 'Not subscribed'
}

const safeParseDate = (value?: string | null) => {
  if (!value) return null
  try {
    const parsed = parseISO(value)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }
    return parsed
  } catch (error) {
    console.warn('Failed to parse date', value, error)
    return null
  }
}

const formatAddressLines = (address?: BasicAddress | null, legacy?: string | null) => {
  if (!address) {
    if (legacy) {
      return legacy
        .split(/\n|,/)
        .map((piece) => piece.trim())
        .filter(Boolean)
    }
    return []
  }

  const lines: string[] = []
  if (address.name) lines.push(address.name)
  if (address.street) lines.push(address.street)

  const localityParts = [address.city, address.state, address.postalCode].filter(Boolean)
  if (localityParts.length > 0) {
    lines.push(localityParts.join(', '))
  }

  if (address.country) {
    lines.push(address.country)
  }

  if (lines.length === 0 && legacy) {
    return legacy
      .split(/\n|,/)
      .map((piece) => piece.trim())
      .filter(Boolean)
  }

  return lines
}

const sumOrderTotals = (orders: CustomerOrderSummary[]) => {
  return orders.reduce((total, order) => total + (order.total ?? 0), 0)
}

const classifyRfmGroup = (orderCount: number, recencyDays: number | null, lifetimeSpend: number) => {
  if (orderCount === 0) return 'Prospect'
  if (recencyDays !== null && recencyDays <= 45 && orderCount >= 3 && lifetimeSpend >= 150) return 'Champion'
  if (recencyDays !== null && recencyDays <= 90 && orderCount >= 2) return 'Loyal'
  if (recencyDays !== null && recencyDays <= 180) return 'Active'
  if (recencyDays !== null && recencyDays > 365) return 'At risk'
  return 'Needs attention'
}

const capitalizeFirst = (value: string) => {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const normalizeMonetaryAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  if (Math.abs(value) >= 100000) return value / 100
  return value
}

const matchStoreCreditText = (text?: string | null) => {
  if (!text) return false
  const normalized = text.toLowerCase()
  return (
    normalized.includes('store credit') ||
    normalized.includes('store_credit') ||
    normalized.includes('account credit') ||
    normalized.includes('account_credit') ||
    normalized.includes('customer credit') ||
    normalized.includes('credit redemption') ||
    normalized.includes('credit_applied') ||
    normalized.includes('credit applied')
  )
}

const isStoreCreditItem = (item?: OrderCartItem | null) => {
  if (!item) return false
  const name = item.name?.toLowerCase() || ''
  if (matchStoreCreditText(name)) return true
  if (!Array.isArray(item.metadata)) return false
  for (const entry of item.metadata) {
    if (!entry) continue
    if (matchStoreCreditText(entry.value)) return true
    if (matchStoreCreditText(entry.key)) return true
    if ((entry.key || '').toLowerCase() === 'type' && (entry.value || '').toLowerCase() === 'store_credit') {
      return true
    }
  }
  return false
}

const computeCartItemAmount = (item?: OrderCartItem | null) => {
  if (!item) return null
  const lineTotal = Number(item.lineTotal)
  if (Number.isFinite(lineTotal) && lineTotal !== 0) {
    return normalizeMonetaryAmount(lineTotal)
  }
  const price = Number(item.price)
  const quantity = Number(item.quantity || 1)
  if (Number.isFinite(price) && Number.isFinite(quantity) && quantity !== 0) {
    return normalizeMonetaryAmount(price * quantity)
  }
  if (Number.isFinite(price)) {
    return normalizeMonetaryAmount(price)
  }
  return null
}

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  master_card: 'Mastercard',
  americanexpress: 'American Express',
  american_express: 'American Express',
  amex: 'American Express',
  diners: 'Diners Club',
  dinersclub: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  union_pay: 'UnionPay',
  maestro: 'Maestro',
}

const normalizeCardBrand = (brand?: string | null) => {
  const raw = brand?.trim()
  if (!raw) return 'Card on file'
  const condensed = raw.toLowerCase().replace(/[\s_-]+/g, '')
  const lookup = CARD_BRAND_LABELS[condensed]
  if (lookup) return lookup
  const words = raw
    .split(/\s+/g)
    .map((part) => capitalizeFirst(part.toLowerCase()))
    .filter(Boolean)
  const formatted = words.join(' ')
  if (formatted) return formatted
  return 'Card on file'
}

const computePaymentMethods = (
  orders?: OrderDocumentLite[] | null,
  stripeMethods?: StripePaymentMethodRecord[] | null,
): PaymentMethodSummary[] => {
  const summary = new Map<string, PaymentMethodSummary>()

  if (Array.isArray(stripeMethods)) {
    stripeMethods.forEach((method) => {
      if (!method) return
      const brand = normalizeCardBrand(method.brand)
      const rawLast4 = (method.last4 || '').replace(/\s+/g, '')
      const last4 = rawLast4 ? rawLast4.slice(-4) : ''
      if (!last4 && brand === 'Card on file') return
      const key = `${brand.toLowerCase()}-${last4 || 'unknown'}`
      const createdAt = method.createdAt ? safeParseDate(method.createdAt) : null
      const existing = summary.get(key)
      if (existing) {
        existing.lastUsed = pickLatestDate(existing.lastUsed, createdAt)
        existing.orderCount = Math.max(existing.orderCount, method.isDefault ? 1 : existing.orderCount)
      } else {
        summary.set(key, {
          key,
          brand,
          last4,
          orderCount: method.isDefault ? 1 : 0,
          lastUsed: createdAt ?? null,
        })
      }
    })
  }

  if (Array.isArray(orders)) {
    for (const order of orders) {
      if (!order) continue
      const brand = normalizeCardBrand(order.cardBrand)
      const rawLast4 = (order.cardLast4 || '').replace(/\s+/g, '')
      const last4 = rawLast4 ? rawLast4.slice(-4) : ''
      if (!last4 && brand === 'Card on file') continue
      const key = `${brand.toLowerCase()}-${last4 || 'unknown'}`
      const lastUsed = safeParseDate(order.createdAt) ?? safeParseDate(order._createdAt)
      const existing = summary.get(key)
      if (existing) {
        existing.orderCount += 1
        existing.lastUsed = pickLatestDate(existing.lastUsed, lastUsed)
      } else {
        summary.set(key, {
          key,
          brand,
          last4,
          orderCount: 1,
          lastUsed: lastUsed ?? null,
        })
      }
    }
  }

  return Array.from(summary.values()).sort((a, b) => {
    const aTime = a.lastUsed ? a.lastUsed.getTime() : 0
    const bTime = b.lastUsed ? b.lastUsed.getTime() : 0
    return bTime - aTime
  })
}

const pickLatestDate = (a: Date | null, b: Date | null): Date | null => {
  if (a && b) return a > b ? a : b
  return a || b || null
}

const computeStoreCreditSummary = (orders?: OrderDocumentLite[] | null): StoreCreditSummary => {
  const summary: StoreCreditSummary = { totalRedeemed: 0, transactions: [] }
  if (!orders || orders.length === 0) return summary
  for (const order of orders) {
    if (!order) continue
    const cart = Array.isArray(order.cart) ? order.cart : []
    const occurredAt = safeParseDate(order.createdAt) ?? safeParseDate(order._createdAt)
    const orderNumber = normalizeOrderNumberValue(order.orderNumber)
    cart.forEach((item, index) => {
      if (!isStoreCreditItem(item)) return
      const amount = computeCartItemAmount(item)
      if (amount === null || amount >= 0) return
      const normalized = Math.abs(amount)
      summary.totalRedeemed += normalized
      const id = `${order._id || orderNumber || 'order'}-${item?._key || index}`
      summary.transactions.push({
        id,
        orderNumber,
        amount: normalized,
        occurredAt,
      })
    })
  }
  summary.transactions.sort((a, b) => {
    const aTime = a.occurredAt ? a.occurredAt.getTime() : 0
    const bTime = b.occurredAt ? b.occurredAt.getTime() : 0
    return bTime - aTime
  })
  return summary
}

const CustomerDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-04-10'})
  const router = useRouter()

  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [customerCount, setCustomerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [activeProfile, setActiveProfile] = useState<CustomerDetail | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewProfile, setPreviewProfile] = useState<CustomerPreview | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchCustomers = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await client.fetch<CustomerResponse>(CUSTOMER_QUERY)
        if (cancelled) return

        const normalized = (response.customers || []).map((customer) => ({
          ...customer,
          displayName: buildDisplayName(customer),
          location: buildLocation(customer),
        }))

        setCustomers(normalized)
        setCustomerCount(response.stats?.customerCount || normalized.length)

        setActiveCustomerId((previous) => {
          if (previous && normalized.some((customer) => customer._id === previous)) {
            return previous
          }
          return normalized[0]?._id ?? null
        })
      } catch (err) {
        console.error('Failed to load customers', err)
        if (!cancelled) {
          setError('Unable to load customers right now. Please try again shortly.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchCustomers()

    return () => {
      cancelled = true
    }
  }, [client])

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((customer) => {
      const haystack = [customer.displayName, customer.email, customer.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [customers, searchTerm])

  useEffect(() => {
    if (!previewOpen || !previewId) return
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewProfile(null)

    client
      .fetch<CustomerPreview | null>(CUSTOMER_PREVIEW_QUERY, {id: previewId})
      .then((result) => {
        if (cancelled) return
        if (result) {
          setPreviewProfile(result)
        } else {
          setPreviewError('Customer record not found.')
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load customer preview', err)
        setPreviewError('Unable to load customer details right now.')
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [client, previewId, previewOpen])

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredCustomers.some((customer) => customer._id === id)))
  }, [filteredCustomers])

  useEffect(() => {
    if (filteredCustomers.length === 0) {
      setActiveCustomerId(null)
      return
    }

    setActiveCustomerId((previous) => {
      if (previous && filteredCustomers.some((customer) => customer._id === previous)) {
        return previous
      }
      return filteredCustomers[0]._id
    })
  }, [filteredCustomers])

  const activeSummary = useMemo(() => {
    if (!activeCustomerId) return null
    return customers.find((customer) => customer._id === activeCustomerId) ?? null
  }, [customers, activeCustomerId])

  useEffect(() => {
    if (!activeCustomerId) {
      setActiveProfile(null)
      setProfileError(null)
      return
    }

    let cancelled = false

    const fetchProfile = async () => {
      setProfileLoading(true)
      setProfileError(null)

      try {
        const detail = await client.fetch<CustomerDetail | null>(CUSTOMER_DETAIL_QUERY, {id: activeCustomerId})
        if (cancelled) return

        if (detail) {
          const normalizedOrders = Array.isArray(detail.orders)
            ? filterOutExpiredOrders(
                detail.orders
                  .map((order) =>
                    order
                      ? {
                          ...order,
                          orderNumber: normalizeOrderNumberValue(order.orderNumber),
                        }
                      : order,
                  )
                  .filter((order): order is CustomerOrderSummary => Boolean(order)),
              )
            : detail.orders

          const normalizedOrderDocs = Array.isArray(detail.orderDocuments)
            ? filterOutExpiredOrders(
                detail.orderDocuments
                  .map((order) =>
                    order
                      ? {
                          ...order,
                          orderNumber: normalizeOrderNumberValue(order.orderNumber),
                        }
                      : order,
                  )
                  .filter((order): order is OrderDocumentLite => Boolean(order)),
              )
            : detail.orderDocuments

          setActiveProfile({
            ...detail,
            orders: normalizedOrders as CustomerOrderSummary[] | null,
            orderDocuments: normalizedOrderDocs as OrderDocumentLite[] | null,
            displayName: buildDisplayName(detail),
            location: buildLocation(detail),
          })
        } else {
          setActiveProfile(null)
        }
      } catch (err) {
        console.error('Failed to load customer profile', err)
        if (!cancelled) {
          setProfileError('Unable to load this profile right now. Please try again shortly.')
          setActiveProfile(null)
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false)
        }
      }
    }

    fetchProfile()

    return () => {
      cancelled = true
    }
  }, [client, activeCustomerId])

  const sortedOrders = useMemo(() => {
    if (!activeProfile?.orders?.length) return []
    return [...activeProfile.orders]
      .filter((order): order is CustomerOrderSummary => Boolean(order && (order.orderNumber || order.orderDate || order.total)))
      .sort((a, b) => {
        const dateA = safeParseDate(a.orderDate)
        const dateB = safeParseDate(b.orderDate)
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return dateB.getTime() - dateA.getTime()
      })
  }, [activeProfile?.orders])

  const latestOrder = sortedOrders[0] ?? null
  const earliestOrder = sortedOrders[sortedOrders.length - 1] ?? null

  const latestOrderDate = safeParseDate(latestOrder?.orderDate)
  const earliestOrderDate = safeParseDate(earliestOrder?.orderDate)
  const createdAtDate = safeParseDate(activeProfile?._createdAt)
  const customerSinceDate = earliestOrderDate ?? createdAtDate

  const orderCountValue = activeProfile?.orderCount ?? sortedOrders.length
  const lifetimeSpendValue = activeProfile?.lifetimeSpend ?? sumOrderTotals(sortedOrders)
  const recencyDays = latestOrderDate ? Math.floor((Date.now() - latestOrderDate.getTime()) / (1000 * 60 * 60 * 24)) : null
  const rfmGroup = classifyRfmGroup(orderCountValue, recencyDays, lifetimeSpendValue)
  const customerSinceText = customerSinceDate
    ? capitalizeFirst(formatDistanceToNow(customerSinceDate, {addSuffix: false}))
    : 'Not yet ordered'

  const metrics = useMemo(
    () => [
      {label: 'Amount spent', value: formatCurrency(lifetimeSpendValue)},
      {label: 'Orders', value: orderCountValue.toLocaleString()},
      {label: 'Customer since', value: customerSinceText},
      {label: 'RFM group', value: rfmGroup},
    ],
    [lifetimeSpendValue, orderCountValue, customerSinceText, rfmGroup],
  )

  const paymentMethods = useMemo(
    () => computePaymentMethods(activeProfile?.orderDocuments, activeProfile?.stripePaymentMethods),
    [activeProfile?.orderDocuments, activeProfile?.stripePaymentMethods],
  )

  const storeCreditSummary = useMemo(
    () => computeStoreCreditSummary(activeProfile?.orderDocuments),
    [activeProfile?.orderDocuments],
  )

  const timelineSections = useMemo<TimelineSection[]>(() => {
    if (!sortedOrders.length) return []

    type TimelineAccumulator = TimelineSection & {sortKey: number}
    const groups = new Map<string, TimelineAccumulator>()

    sortedOrders.forEach((order, index) => {
      const orderDate = safeParseDate(order.orderDate)
      const dateKey = orderDate ? format(orderDate, 'yyyy-MM-dd') : `undated-${index}`
      const timeLabel = orderDate ? format(orderDate, 'p') : null

      const statusText = order.status ? `Status: ${order.status}` : null
      const totalText = typeof order.total === 'number' ? `Total: ${formatCurrency(order.total)}` : null
      const descriptionParts = [statusText, totalText].filter(Boolean)
      const description = descriptionParts.length > 0 ? descriptionParts.join(' · ') : 'Order recorded'

      const entry: TimelineEntry = {
        id: `${order.orderNumber ?? 'order'}-${index}`,
        title: order.orderNumber ? `Order ${order.orderNumber}` : 'Order placed',
        description,
        timeLabel,
      }

      const existing = groups.get(dateKey)
      if (existing) {
        existing.entries.push(entry)
      } else {
        groups.set(dateKey, {
          dateLabel: orderDate ? format(orderDate, 'MMMM d, yyyy') : 'Date unavailable',
          entries: [entry],
          sortKey: orderDate ? orderDate.getTime() : -(index + 1),
        })
      }
    })

    return Array.from(groups.values())
      .sort((a, b) => b.sortKey - a.sortKey)
      .map((section) => ({
        dateLabel: section.dateLabel,
        entries: section.entries.sort((a, b) => {
          if (!a.timeLabel || !b.timeLabel) return 0
          return b.timeLabel.localeCompare(a.timeLabel)
        }),
      }))
  }, [sortedOrders])

  const shippingLines = formatAddressLines(activeProfile?.shippingAddress, activeProfile?.address)
  const billingLines = formatAddressLines(activeProfile?.billingAddress)
  const roleTags = activeProfile?.roles && activeProfile.roles.length > 0 ? activeProfile.roles : ['customer']

  const marketingStatuses = [
    {label: 'Email', subscribed: Boolean(activeProfile?.emailOptIn)},
    {label: 'Marketing email', subscribed: Boolean(activeProfile?.marketingOptIn)},
    {label: 'SMS', subscribed: Boolean(activeProfile?.textOptIn)},
  ]

  const allSelected = filteredCustomers.length > 0 && selectedIds.length === filteredCustomers.length

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredCustomers.map((customer) => customer._id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }

  const handleRowNavigate = (id: string) => {
    router.navigateIntent('edit', {id, type: 'customer'})
  }

  const filteredActiveIndex = filteredCustomers.findIndex((customer) => customer._id === activeCustomerId)
  const canGoPrevious = filteredActiveIndex > 0
  const canGoNext = filteredActiveIndex !== -1 && filteredActiveIndex < filteredCustomers.length - 1

  const goToPrevious = () => {
    if (!canGoPrevious) return
    const previousCustomer = filteredCustomers[filteredActiveIndex - 1]
    if (previousCustomer) {
      setActiveCustomerId(previousCustomer._id)
    }
  }

  const goToNext = () => {
    if (!canGoNext) return
    const nextCustomer = filteredCustomers[filteredActiveIndex + 1]
    if (nextCustomer) {
      setActiveCustomerId(nextCustomer._id)
    }
  }

  const handleOpenInStudio = useCallback(() => {
    if (!activeCustomerId) return
    router.navigateIntent('edit', {id: activeCustomerId, type: 'customer'})
  }, [router, activeCustomerId])

  const handleCreateOrder = useCallback(() => {
    router.navigateIntent('create', {type: 'order'})
  }, [router])

  const handleCopyToClipboard = useCallback((value?: string | null) => {
    if (!value) return
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch((err) => {
        console.warn('Copy failed', err)
      })
    }
  }, [])

  const activeDisplayName = activeProfile?.displayName ?? activeSummary?.displayName ?? 'Select a customer'
  const activeEmail = activeProfile?.email ?? activeSummary?.email ?? ''

  const openPreview = useCallback((id: string) => {
    setPreviewId(id)
    setPreviewOpen(true)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewOpen(false)
    setPreviewId(null)
    setPreviewProfile(null)
    setPreviewError(null)
  }, [])

  const handlePreviewOpenInStudio = useCallback(() => {
    if (!previewId) return
    router.navigateIntent('edit', {id: previewId, type: 'customer'})
    closePreview()
  }, [closePreview, previewId, router])

  const handlePreviewShowProfile = useCallback(() => {
    if (!previewId) return
    setActiveCustomerId(previewId)
    closePreview()
  }, [closePreview, previewId])

  const previewDisplayName = previewProfile
    ? [previewProfile.firstName, previewProfile.lastName].filter(Boolean).join(' ').trim() ||
      previewProfile.name ||
      previewProfile.email ||
      'Customer'
    : 'Customer'

  const previewShippingLines = formatAddressLines(previewProfile?.shippingAddress)
  const previewBillingLines = formatAddressLines(previewProfile?.billingAddress)

  return (
    <div ref={ref} className="studio-surface flex h-full min-h-0 flex-col rounded-3xl">
      <div className="flex-1 overflow-hidden px-6 py-6">
        <div className="mx-auto flex h-full max-w-7xl flex-col gap-6 lg:flex-row">
          <div className="flex flex-col gap-4 lg:w-[420px] xl:w-[460px]">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
              <div className="border-b border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-semibold text-[var(--studio-text)]">Customers</h1>
                    <p className="mt-1 text-sm text-[var(--studio-muted)]">
                      {customerCount.toLocaleString()} customers · {customerCount > 0 ? '100% of your customer base' : 'No customers yet'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-4 py-2 text-sm font-medium text-[var(--studio-text)] shadow-sm transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]"
                      onClick={() => console.info('Export customers action not yet connected')}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-4 py-2 text-sm font-medium text-[var(--studio-text)] shadow-sm transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]"
                      onClick={() => console.info('Import customers action not yet connected')}
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                      onClick={() => router.navigateIntent('create', {type: 'customer'})}
                    >
                      Add customer
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                )}
              </div>

              <div className="border-b border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[220px]">
                    <input
                      type="search"
                      className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-10 py-2 text-sm text-[var(--studio-text)] shadow-inner outline-none transition placeholder:text-[rgba(148,163,184,0.7)] focus:border-[var(--studio-border-strong)] focus:ring-2 focus:ring-slate-200"
                      placeholder="Search customers"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[rgba(148,163,184,0.7)]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path
                          fillRule="evenodd"
                          d="M9 3.5a5.5 5.5 0 013.74 9.54l3.61 3.61a.75.75 0 11-1.06 1.06l-3.61-3.61A5.5 5.5 0 119 3.5zm0 1.5a4 4 0 100 8 4 4 0 000-8z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-3 py-2 text-sm font-medium text-[var(--studio-text)] shadow-sm transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]"
                      onClick={() => console.info('Filter menu not yet connected')}
                    >
                      Add filter
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative flex-1 min-h-0">
                {loading && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center"
                    style={{background: 'var(--studio-backdrop)'}}
                  >
                    <Spinner muted size={4} />
                  </div>
                )}
                <div className="h-full overflow-x-auto overflow-y-auto">
                  <table className="min-w-full table-fixed divide-y divide-slate-200">
                    <thead className="sticky top-0 z-10 bg-[var(--studio-surface-soft)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                      <tr>
                        <th className="w-12 px-6 py-3">
                          <label className="inline-flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-[var(--studio-border-strong)] text-[var(--studio-text)] focus:ring-slate-400"
                              checked={allSelected}
                              onChange={toggleSelectAll}
                              aria-label="Select all customers"
                            />
                          </label>
                        </th>
                        <th className="w-1/4 px-3 py-3">Customer name</th>
                        <th className="w-48 px-3 py-3">Email subscription</th>
                        <th className="w-1/4 px-3 py-3">Location</th>
                        <th className="w-32 px-3 py-3">Orders</th>
                        <th className="w-32 px-6 py-3 text-right">Amount spent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm text-[var(--studio-text)]">
                      {filteredCustomers.length === 0 && !loading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-10 text-center text-sm text-[var(--studio-muted)]">
                            No customers match your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map((customer) => {
                          const isSelected = selectedIds.includes(customer._id)
                          const isActive = customer._id === activeCustomerId
                          return (
                            <tr
                              key={customer._id}
                              className={`group cursor-pointer transition ${
                                isActive ? 'bg-[var(--studio-surface-soft)]' : 'bg-[var(--studio-surface-strong)] hover:bg-[var(--studio-surface-soft)]'
                              }`}
                              onClick={() => setActiveCustomerId(customer._id)}
                              onDoubleClick={() => handleRowNavigate(customer._id)}
                              aria-selected={isActive}
                            >
                              <td className="px-6 py-4">
                                <label className="inline-flex items-center">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-[var(--studio-border-strong)] text-[var(--studio-text)] focus:ring-slate-400"
                                    checked={isSelected}
                                    onChange={(event) => {
                                      event.stopPropagation()
                                      toggleSelect(customer._id)
                                    }}
                                    aria-label={`Select customer ${customer.displayName}`}
                                  />
                                </label>
                              </td>
                              <td className="px-3 py-4">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openPreview(customer._id)
                                  }}
                                  className="font-medium text-[var(--studio-text)] transition hover:text-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                  style={{background: 'transparent', border: 'none', padding: 0, textAlign: 'left'}}
                                >
                                  {customer.displayName}
                                </button>
                                {customer.email && <div className="text-xs text-[var(--studio-muted)]">{customer.email}</div>}
                              </td>
                              <td className="px-3 py-4">
                                <span className="inline-flex items-center rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--studio-muted)]">
                                  {getSubscriptionStatus(customer)}
                                </span>
                              </td>
                              <td className="px-3 py-4 text-[var(--studio-muted)]">{customer.location}</td>
                              <td className="px-3 py-4 text-[var(--studio-muted)]">{formatOrders(customer.orderCount ?? 0)}</td>
                              <td className="px-6 py-4 text-right font-medium text-[var(--studio-text)]">
                                {formatCurrency(customer.lifetimeSpend ?? 0)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
            {profileLoading ? (
              <div className="flex h-full items-center justify-center"><Spinner muted size={4} /></div>
            ) : activeCustomerId ? (
              <div className="flex h-full flex-col">
                <header className="border-b border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-3">
                      <nav className="flex items-center gap-2 text-sm text-[var(--studio-muted)]">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--studio-surface-soft)] text-sm font-semibold text-[var(--studio-muted)]">C</span>
                        <span className="text-[rgba(148,163,184,0.7)]">/</span>
                        <span className="truncate font-medium text-[var(--studio-muted)]">Customers</span>
                        <span className="text-[rgba(148,163,184,0.7)]">/</span>
                        <button
                          type="button"
                          onClick={handleOpenInStudio}
                          className="truncate border-0 bg-transparent p-0 text-left font-semibold text-[var(--studio-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--studio-surface-strong)]"
                          title={activeDisplayName}
                        >
                          {activeDisplayName}
                        </button>
                      </nav>
                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-semibold text-[var(--studio-text)]" title={activeDisplayName}>
                          <button
                            type="button"
                            onClick={handleOpenInStudio}
                            className="block w-full truncate border-0 bg-transparent p-0 text-left text-[inherit] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--studio-surface-strong)]"
                          >
                            {activeDisplayName}
                          </button>
                        </h2>
                        {activeEmail && <p className="truncate text-sm text-[var(--studio-muted)]">{activeEmail}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-4 py-2 text-sm font-medium text-[var(--studio-text)] shadow-sm transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]"
                        onClick={handleOpenInStudio}
                      >
                        More actions
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M6 6.75a.75.75 0 111.5 0A.75.75 0 016 6.75zM9.25 6.75a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM13.5 6.75a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
                        </svg>
                      </button>
                      <div className="flex items-center overflow-hidden rounded-lg border border-[var(--studio-border)]">
                        <button
                          type="button"
                          onClick={goToPrevious}
                          disabled={!canGoPrevious}
                          className={`flex h-9 w-10 items-center justify-center text-[var(--studio-muted)] transition ${
                            canGoPrevious ? 'hover:bg-[var(--studio-surface-soft)]' : 'cursor-not-allowed opacity-40'
                          }`}
                          aria-label="Previous customer"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M11.03 5.47a.75.75 0 010 1.06L8.56 9l2.47 2.47a.75.75 0 11-1.06 1.06l-3-3a.75.75 0 010-1.06l3-3a.75.75 0 011.06 0z" />
                          </svg>
                        </button>
                        <div className="h-9 w-px bg-slate-200" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={goToNext}
                          disabled={!canGoNext}
                          className={`flex h-9 w-10 items-center justify-center text-[var(--studio-muted)] transition ${
                            canGoNext ? 'hover:bg-[var(--studio-surface-soft)]' : 'cursor-not-allowed opacity-40'
                          }`}
                          aria-label="Next customer"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M8.97 5.47a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06L11.44 9 8.97 6.53a.75.75 0 010-1.06z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  {profileError && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profileError}</div>
                  )}
                </header>

                <div className="flex-1 overflow-auto" style={{background: 'var(--studio-surface-overlay)'}}>
                  <div className="flex flex-col gap-6 px-6 py-6">
                    <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:justify-between">
                        <div className="flex flex-1 flex-wrap gap-4">
                          {metrics.map((metric) => (
                            <div
                              key={metric.label}
                              className="flex min-w-[160px] flex-1 flex-col rounded-lg border border-[var(--studio-border)] p-4"
                              style={{background: 'var(--studio-surface-overlay)'}}
                            >
                              <span className="text-xs font-medium uppercase tracking-wide text-[var(--studio-muted)]">
                                {metric.label}
                              </span>
                              <span className="mt-2 text-lg font-semibold text-[var(--studio-text)]">{metric.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                      <div className="flex flex-col gap-6">
                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div>
                                <h3 className="text-lg font-semibold text-[var(--studio-text)]">Last order placed</h3>
                                {latestOrderDate && (
                                  <p className="text-sm text-[var(--studio-muted)]">
                                    {format(latestOrderDate, "MMMM d, yyyy 'at' h:mm a")}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-3 py-2 text-xs font-medium text-[var(--studio-text)] shadow-sm transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]"
                                  onClick={handleOpenInStudio}
                                >
                                  View all orders
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                  onClick={handleCreateOrder}
                                >
                                  Create order
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="px-6 py-5">
                            {latestOrder ? (
                              <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                  {latestOrder.orderNumber ? (
                                    <span className="text-base font-semibold text-[var(--studio-text)]">#{latestOrder.orderNumber}</span>
                                  ) : (
                                    <span className="text-base font-semibold text-[var(--studio-text)]">Order</span>
                                  )}
                                  {latestOrder.status && (
                                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                      {latestOrder.status}
                                    </span>
                                  )}
                                  {latestOrderDate && (
                                    <span className="inline-flex items-center rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--studio-muted)]">
                                      {formatDistanceToNow(latestOrderDate, {addSuffix: true})}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-baseline justify-between gap-4 text-[var(--studio-text)]">
                                  <div>
                                    <p className="text-sm text-[var(--studio-muted)]">Order total</p>
                                    <p className="text-xl font-semibold text-[var(--studio-text)]">
                                      {formatCurrency(latestOrder.total ?? 0)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--studio-muted)]">This customer has not placed any orders yet.</p>
                            )}
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <h3 className="text-lg font-semibold text-[var(--studio-text)]">Timeline</h3>
                          </div>
                          <div className="px-6 py-5">
                            {timelineSections.length === 0 ? (
                              <p className="text-sm text-[var(--studio-muted)]">Order activity will appear here once this customer places an order.</p>
                            ) : (
                              <div className="space-y-6">
                                {timelineSections.map((section) => (
                                  <div key={section.dateLabel}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                                      {section.dateLabel}
                                    </h4>
                                    <ul className="mt-3 space-y-4 border-l border-[var(--studio-border)] pl-5">
                                      {section.entries.map((entry) => (
                                        <li key={entry.id} className="relative">
                                          <span className="absolute -left-[29px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden="true" />
                                          <div className="flex flex-col gap-1">
                                            <p className="text-sm font-medium text-[var(--studio-text)]">{entry.title}</p>
                                            <p className="text-sm text-[var(--studio-muted)]">{entry.description}</p>
                                            {entry.timeLabel && (
                                              <p className="text-xs text-[rgba(148,163,184,0.7)]">{entry.timeLabel}</p>
                                            )}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </section>
                      </div>

                      <div className="flex flex-col gap-6">
                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-semibold text-[var(--studio-text)]">Customer</h3>
                              <button
                                type="button"
                                onClick={handleOpenInStudio}
                                className="rounded-md p-1.5 text-[var(--studio-muted)] transition hover:bg-[var(--studio-surface-soft)] hover:text-[var(--studio-text)]"
                                aria-label="Open customer document"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path d="M10 3a1 1 0 01.894.553l.382.764a1 1 0 00.724.547l.843.13a1 1 0 01.554 1.706l-.61.595a1 1 0 00-.287.885l.144.84a1 1 0 01-1.451 1.054l-.755-.397a1 1 0 00-.931 0l-.755.397a1 1 0 01-1.451-1.054l.144-.84a1 1 0 00-.287-.885l-.61-.595a1 1 0 01.554-1.706l.843-.13a1 1 0 00.724-.547l.382-.764A1 1 0 0110 3z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="space-y-6 px-6 py-5 text-sm text-[var(--studio-text)]">
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">Contact information</h4>
                              <div className="flex flex-wrap items-center gap-2">
                                {activeEmail ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyToClipboard(activeEmail)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-3 py-2 text-sm font-medium text-[var(--studio-text)] shadow-sm transition hover:border-[var(--studio-border-strong)] hover:text-[var(--studio-text)]"
                                  >
                                    {activeEmail}
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                      <path d="M5 6a2 2 0 012-2h4a2 2 0 012 2v1h-1.5V6a.5.5 0 00-.5-.5H7A.5.5 0 006.5 6v8a.5.5 0 00.5.5h4a.5.5 0 00.5-.5v-1H13v1a2 2 0 01-2 2H7a2 2 0 01-2-2V6z" />
                                      <path d="M9 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-6a1 1 0 01-1-1V8z" />
                                    </svg>
                                  </button>
                                ) : (
                                  <span className="text-[var(--studio-muted)]">No email on file</span>
                                )}
                              </div>
                              {activeProfile?.phone && (
                                <div className="text-[var(--studio-muted)]">{activeProfile.phone}</div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">Default address</h4>
                              {shippingLines.length > 0 ? (
                                <address className="not-italic leading-relaxed text-[var(--studio-text)]">
                                  {shippingLines.map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                </address>
                              ) : (
                                <p className="text-[var(--studio-muted)]">No shipping address stored.</p>
                              )}
                            </div>

                            {billingLines.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">Billing address</h4>
                                <address className="not-italic leading-relaxed text-[var(--studio-text)]">
                                  {billingLines.map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                </address>
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <h3 className="text-lg font-semibold text-[var(--studio-text)]">Marketing</h3>
                          </div>
                          <div className="space-y-3 px-6 py-5 text-sm">
                            {marketingStatuses.map((status) => (
                              <div key={status.label} className="flex items-center gap-2 text-[var(--studio-text)]">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    status.subscribed ? 'bg-emerald-500' : 'bg-slate-300'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="font-medium text-[var(--studio-text)]">{status.label}</span>
                                <span className="text-[var(--studio-muted)]">
                                  {status.subscribed ? 'Subscribed' : 'Not subscribed'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <h3 className="text-lg font-semibold text-[var(--studio-text)]">Payment method</h3>
                          </div>
                          <div className="px-6 py-5 text-sm">
                            {paymentMethods.length > 0 ? (
                              <ul className="space-y-3 text-[var(--studio-text)]">
                                {paymentMethods.slice(0, 3).map((method) => (
                                  <li key={method.key} className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="font-medium text-[var(--studio-text)]">
                                        {method.last4 ? `${method.brand} •••• ${method.last4}` : method.brand}
                                      </div>
                                      <div className="text-xs text-[var(--studio-muted)]">
                                        {method.lastUsed
                                          ? `Last used ${formatDistanceToNow(method.lastUsed, {addSuffix: true})}`
                                          : 'Usage date unavailable'}
                                      </div>
                                    </div>
                                    <span className="rounded-full bg-[var(--studio-surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--studio-muted)]">
                                      {method.orderCount} {method.orderCount === 1 ? 'order' : 'orders'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[var(--studio-muted)]">We haven’t recorded any card payments for this customer yet.</p>
                            )}
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <h3 className="text-lg font-semibold text-[var(--studio-text)]">Store credit</h3>
                          </div>
                          <div className="px-6 py-5 text-sm">
                            {storeCreditSummary.transactions.length > 0 ? (
                              <div className="space-y-4 text-[var(--studio-text)]">
                                <div className="flex flex-wrap gap-6">
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                                      Total redeemed
                                    </div>
                                    <div className="text-base font-semibold text-[var(--studio-text)]">
                                      {formatCurrency(storeCreditSummary.totalRedeemed)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                                      Transactions
                                    </div>
                                    <div className="text-base font-semibold text-[var(--studio-text)]">
                                      {storeCreditSummary.transactions.length.toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                                <ul className="space-y-3">
                                  {storeCreditSummary.transactions.slice(0, 5).map((transaction) => (
                                    <li key={transaction.id} className="flex flex-col gap-0.5">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-[var(--studio-text)]">
                                          Redeemed {formatCurrency(transaction.amount)}
                                        </span>
                                        {transaction.orderNumber ? (
                                          <span className="text-xs text-[var(--studio-muted)]">Order {transaction.orderNumber}</span>
                                        ) : null}
                                      </div>
                                      <span className="text-xs text-[var(--studio-muted)]">
                                        {transaction.occurredAt
                                          ? `${format(transaction.occurredAt, 'MMM d, yyyy')} • ${formatDistanceToNow(transaction.occurredAt, {addSuffix: true})}`
                                          : 'Date unavailable'}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                {storeCreditSummary.transactions.length > 5 ? (
                                  <p className="text-xs text-[var(--studio-muted)]">
                                    Showing the 5 most recent credits out of {storeCreditSummary.transactions.length}.
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-[var(--studio-muted)]">No store credit usage found in recent orders.</p>
                            )}
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-lg font-semibold text-[var(--studio-text)]">Tags</h3>
                              <button
                                type="button"
                                onClick={handleOpenInStudio}
                                className="rounded-md p-1.5 text-[var(--studio-muted)] transition hover:bg-[var(--studio-surface-soft)] hover:text-[var(--studio-text)]"
                                aria-label="Manage tags"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path d="M5 10a1 1 0 011-1h3V6a1 1 0 112 0v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 01-1-1z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 px-6 py-5 text-sm text-[var(--studio-text)]">
                            {roleTags.map((tag) => (
                              <span key={tag} className="inline-flex items-center rounded-full bg-[var(--studio-surface-soft)] px-3 py-1 text-xs font-medium text-[var(--studio-muted)]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
                          <div className="border-b border-[var(--studio-border)] px-6 py-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-semibold text-[var(--studio-text)]">Notes</h3>
                              <button
                                type="button"
                                onClick={handleOpenInStudio}
                                className="rounded-md p-1.5 text-[var(--studio-muted)] transition hover:bg-[var(--studio-surface-soft)] hover:text-[var(--studio-text)]"
                                aria-label="Edit notes"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path d="M5.433 13.917l-.318 1.59a.75.75 0 00.884.884l1.59-.318a5.75 5.75 0 002.742-1.503l5.06-5.06a2.25 2.25 0 00-3.182-3.182l-5.06 5.06a5.75 5.75 0 00-1.503 2.742z" />
                                  <path d="M3.5 5.75a2.25 2.25 0 012.25-2.25h4a.75.75 0 010 1.5h-4a.75.75 0 00-.75.75v10a.75.75 0 00.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0114.25 17h-8.5A2.25 2.25 0 013.5 14.75v-9z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="px-6 py-5 text-sm text-[var(--studio-muted)]">No notes recorded for this customer.</div>
                        </section>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-[var(--studio-muted)]">
                Select a customer from the list to view their profile.
              </div>
            )}
          </div>
        </div>
      </div>
      {previewOpen && (
        <Dialog header={previewDisplayName} id="customer-preview" onClose={closePreview} width={1} zOffset={1000}>
          <Card padding={4} tone="transparent">
            {previewLoading ? (
              <Flex align="center" justify="center" style={{minHeight: 160}}>
                <Spinner muted size={4} />
              </Flex>
            ) : previewError ? (
              <Text style={{color: 'var(--card-critical-fg-color)'}}>{previewError}</Text>
            ) : previewProfile ? (
              <Stack space={4}>
                <Stack space={2}>
                  <Text size={2} weight="semibold">
                    Contact
                  </Text>
                  <Stack space={1}>
                    <Text size={2}>{previewDisplayName}</Text>
                    {previewProfile.email && (
                      <Text size={1} muted>
                        {previewProfile.email}
                      </Text>
                    )}
                    {previewProfile.phone && (
                      <Text size={1} muted>
                        {previewProfile.phone}
                      </Text>
                    )}
                  </Stack>
                </Stack>

                <Stack space={2}>
                  <Text size={2} weight="semibold">
                    Shipping address
                  </Text>
                  {previewShippingLines.length > 0 ? (
                    <Stack space={1}>
                      {previewShippingLines.map((line) => (
                        <Text key={line} size={1}>
                          {line}
                        </Text>
                      ))}
                    </Stack>
                  ) : (
                    <Text size={1} muted>
                      No shipping address on file.
                    </Text>
                  )}
                </Stack>

                <Stack space={2}>
                  <Text size={2} weight="semibold">
                    Billing address
                  </Text>
                  {previewBillingLines.length > 0 ? (
                    <Stack space={1}>
                      {previewBillingLines.map((line) => (
                        <Text key={line} size={1}>
                          {line}
                        </Text>
                      ))}
                    </Stack>
                  ) : (
                    <Text size={1} muted>
                      No billing address on file.
                    </Text>
                  )}
                </Stack>

                <Flex gap={4} wrap="wrap">
                  <Card padding={3} radius={2} shadow={1} tone="transparent">
                    <Stack space={1}>
                      <Text size={1} muted>
                        Orders
                      </Text>
                      <Text size={2} weight="semibold">
                        {previewProfile.orderCount ?? 0}
                      </Text>
                    </Stack>
                  </Card>
                  <Card padding={3} radius={2} shadow={1} tone="transparent">
                    <Stack space={1}>
                      <Text size={1} muted>
                        Lifetime spend
                      </Text>
                      <Text size={2} weight="semibold">
                        {formatCurrency(previewProfile.lifetimeSpend)}
                      </Text>
                    </Stack>
                  </Card>
                </Flex>

                {previewProfile.roles && previewProfile.roles.length > 0 && (
                  <Stack space={2}>
                    <Text size={2} weight="semibold">
                      Roles
                    </Text>
                    <Flex gap={2} wrap="wrap">
                      {previewProfile.roles.map((role) => (
                        <Card key={role} paddingX={3} paddingY={1} radius={2} shadow={0} tone="transparent">
                          <Text size={1} muted>
                            {role}
                          </Text>
                        </Card>
                      ))}
                    </Flex>
                  </Stack>
                )}
              </Stack>
            ) : null}
          </Card>
          <Flex gap={2} justify="flex-end" padding={4} paddingTop={0}>
            <Button mode="bleed" text="Close" onClick={closePreview} />
            <Button text="Full profile" onClick={handlePreviewShowProfile} disabled={!previewId} />
            <Button
              tone="primary"
              text="Edit in Studio"
              onClick={handlePreviewOpenInStudio}
              disabled={!previewId}
            />
          </Flex>
        </Dialog>
      )}
    </div>
  )
})

CustomerDashboard.displayName = 'CustomerDashboard'

export default CustomerDashboard
