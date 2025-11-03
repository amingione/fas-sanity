import React from 'react'
import {Inline, Text} from '@sanity/ui'
import {PaginatedDocumentTable, formatCurrency, formatDate} from './PaginatedDocumentTable'
import {formatOrderNumber} from '../../../utils/orderNumber'
import {deriveOrderDisplay, type OrderV2Snapshot} from '../../../utils/orderV2'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './DocumentBadge'
import {GROQ_FILTER_EXCLUDE_EXPIRED} from '../../../utils/orderFilters'

type OrderRowData = {
  orderNumber?: string | null
  invoiceOrderNumber?: string | null
  invoiceNumber?: string | null
  stripeSessionId?: string | null
  status?: string | null
  paymentStatus?: string | null
  customerName?: string | null
  customerEmail?: string | null
  shippingName?: string | null
  totalAmount?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
  orderV2?: OrderV2Snapshot | null
}

const ORDER_PROJECTION = `{
  orderNumber,
  stripeSessionId,
  "invoiceOrderNumber": invoiceRef->orderNumber,
  "invoiceNumber": invoiceRef->invoiceNumber,
  status,
  paymentStatus,
  customerName,
  customerEmail,
  "shippingName": shippingAddress.name,
  totalAmount,
  amountRefunded,
  currency,
  "createdAt": coalesce(createdAt, _createdAt),
  orderV2
}`

export const NEW_ORDERS_FILTER =
  `!defined(fulfilledAt) && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && !(status in ["fulfilled","shipped","cancelled","refunded","closed"])`

const DEFAULT_ORDERINGS: Array<{field: string; direction: 'asc' | 'desc'}> = [
  {field: '_createdAt', direction: 'desc'},
]

type OrdersDocumentTableProps = {
  title?: string
  filter?: string
  emptyState?: string
  orderings?: Array<{field: string; direction: 'asc' | 'desc'}>
  pageSize?: number
  excludeCheckoutSessionExpired?: boolean
}

function resolveOrderNumber(data: OrderRowData & {_id: string}) {
  const display = deriveOrderDisplay(data)
  const candidate = display.identifiers.find((id) => formatOrderNumber(id))
  if (candidate) {
    const formatted = formatOrderNumber(candidate)
    if (formatted) return formatted
  }

  const fallback = display.identifiers.find((id) => id && id.trim())
  if (fallback) return fallback

  const sessionFormatted = formatOrderNumber(data.stripeSessionId)
  if (sessionFormatted) return sessionFormatted

  const trimmedId = data._id.replace(/^drafts\./, '')
  const randomFallback = trimmedId.slice(-6).toUpperCase()
  return randomFallback ? `#${randomFallback}` : '—'
}

function getCustomerLabel(data: OrderRowData) {
  const display = deriveOrderDisplay(data)
  const candidates = [display.customerName, display.shippingName, display.customerEmail]
  for (const value of candidates) {
    if (value && value.trim()) return value
  }
  return '—'
}

export default function OrdersDocumentTable({
  title = 'Orders',
  filter,
  emptyState = 'No orders found',
  orderings = DEFAULT_ORDERINGS,
  pageSize = 8,
  excludeCheckoutSessionExpired = true,
}: OrdersDocumentTableProps = {}) {
  type OrderRow = OrderRowData & {_id: string; _type: string}

  const filterClauses: string[] = []
  if (excludeCheckoutSessionExpired) {
    filterClauses.push(`(${GROQ_FILTER_EXCLUDE_EXPIRED})`)
  }
  if (filter && filter.trim().length > 0) {
    filterClauses.push(`(${filter.trim()})`)
  }
  const combinedFilter = filterClauses.join(' && ')

  return (
    <PaginatedDocumentTable<OrderRowData>
      title={title}
      documentType="order"
      projection={ORDER_PROJECTION}
      orderings={orderings}
      pageSize={pageSize}
      filter={combinedFilter || undefined}
      emptyState={emptyState}
      excludeExpired={excludeCheckoutSessionExpired}
      columns={[
        {
          key: 'order',
          header: 'Order',
          render: (data: OrderRow) => (
            <Text size={1} weight="medium">
              {resolveOrderNumber(data)}
            </Text>
          ),
        },
        {
          key: 'customer',
          header: 'Customer',
          render: (data: OrderRow) => <Text size={1}>{getCustomerLabel(data)}</Text>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (data: OrderRow) => {
            const display = deriveOrderDisplay(data)
            const badges: React.ReactNode[] = []
            const paymentLabel = formatBadgeLabel(display.paymentStatus)
            if (paymentLabel) {
              badges.push(
                <DocumentBadge
                  key="payment-status"
                  label={paymentLabel}
                  tone={resolveBadgeTone(display.paymentStatus)}
                  title={`Payment status: ${paymentLabel}`}
                />,
              )
            }

            const fulfillmentLabel =
              display.status && display.status !== display.paymentStatus
                ? formatBadgeLabel(display.status)
                : null

            if (fulfillmentLabel) {
              badges.push(
                <DocumentBadge
                  key="fulfillment-status"
                  label={fulfillmentLabel}
                  tone={resolveBadgeTone(display.status)}
                  title={`Order status: ${fulfillmentLabel}`}
                />,
              )
            }

            if (!badges.length) {
              return <Text size={1}>—</Text>
            }

            return (
              <Inline space={4} style={{flexWrap: 'wrap', rowGap: '12px'}}>
                {badges}
              </Inline>
            )
          },
        },
        {
          key: 'amount',
          header: 'Total',
          align: 'right',
          render: (data: OrderRow) => {
            const display = deriveOrderDisplay(data)
            return (
              <Text size={1}>
                {formatCurrency(display.totalAmount ?? null, display.currency ?? 'USD')}
              </Text>
            )
          },
        },
        {
          key: 'refunded',
          header: 'Refunded',
          align: 'right',
          render: (data: OrderRow) => {
            const display = deriveOrderDisplay(data)
            const value = display.amountRefunded
            return (
              <Text size={1}>
                {value && value > 0 ? formatCurrency(value, display.currency ?? 'USD') : '—'}
              </Text>
            )
          },
        },
        {
          key: 'created',
          header: 'Created',
          render: (data: OrderRow) => {
            const display = deriveOrderDisplay(data)
            return <Text size={1}>{formatDate(display.createdAt)}</Text>
          },
        },
      ]}
    />
  )
}
