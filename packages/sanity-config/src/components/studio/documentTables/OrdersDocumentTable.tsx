import React from 'react'
import {Text} from '@sanity/ui'
import {PaginatedDocumentTable, formatCurrency, formatDate} from './PaginatedDocumentTable'

type OrderRowData = {
  orderNumber?: string | null
  status?: string | null
  paymentStatus?: string | null
  customerName?: string | null
  customerEmail?: string | null
  totalAmount?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
}

const ORDER_PROJECTION = `{
  orderNumber,
  status,
  paymentStatus,
  customerName,
  customerEmail,
  totalAmount,
  amountRefunded,
  currency,
  "createdAt": coalesce(createdAt, _createdAt)
}`

function getCustomerLabel(data: OrderRowData) {
  const candidates = [data.customerName, data.customerEmail]
  for (const value of candidates) {
    if (value && value.trim()) return value
  }
  return '—'
}

const toTitleCase = (value?: string | null) => {
  if (!value) return '—'
  const trimmed = value.trim().replace(/_/g, ' ')
  if (!trimmed) return '—'
  return trimmed
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export default function OrdersDocumentTable() {
  type OrderRow = OrderRowData & {_id: string; _type: string}

  return (
    <PaginatedDocumentTable<OrderRowData>
      title="Orders"
      documentType="order"
      projection={ORDER_PROJECTION}
      orderings={[{field: '_createdAt', direction: 'desc'}]}
      pageSize={8}
      columns={[
        {
          key: 'order',
          header: 'Order',
          render: (data: OrderRow) => (
            <Text size={1} weight="medium">
              {data.orderNumber || '—'}
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
          render: (data: OrderRow) => (
            <Text size={1} muted>
              {toTitleCase(data.paymentStatus)}
              {data.status && data.status !== data.paymentStatus
                ? ` • ${toTitleCase(data.status)}`
                : ''}
            </Text>
          ),
        },
        {
          key: 'amount',
          header: 'Total',
          align: 'right',
          render: (data: OrderRow) =>
            <Text size={1}>{formatCurrency(data.totalAmount ?? null, data.currency ?? 'USD')}</Text>,
        },
        {
          key: 'refunded',
          header: 'Refunded',
          align: 'right',
          render: (data: OrderRow) =>
            <Text size={1}>
              {data.amountRefunded && data.amountRefunded > 0
                ? formatCurrency(data.amountRefunded, data.currency ?? 'USD')
                : '—'}
            </Text>,
        },
        {
          key: 'created',
          header: 'Created',
          render: (data: OrderRow) => <Text size={1}>{formatDate(data.createdAt)}</Text>,
        },
      ]}
    />
  )
}
