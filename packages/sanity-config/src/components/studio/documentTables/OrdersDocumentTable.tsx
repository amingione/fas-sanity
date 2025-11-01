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

export default function OrdersDocumentTable() {
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
          render: (data) => (
            <Text size={1} weight="medium">
              {data.orderNumber || '—'}
            </Text>
          ),
        },
        {
          key: 'customer',
          header: 'Customer',
          render: (data) => <Text size={1}>{getCustomerLabel(data)}</Text>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (data) => (
            <Text size={1}>
              {data.paymentStatus ? data.paymentStatus : '—'}
              {data.status && data.status !== data.paymentStatus
                ? ` • ${data.status}`
                : null}
            </Text>
          ),
        },
        {
          key: 'amount',
          header: 'Total',
          align: 'right',
          render: (data) =>
            <Text size={1}>{formatCurrency(data.totalAmount ?? null, data.currency ?? 'USD')}</Text>,
        },
        {
          key: 'refunded',
          header: 'Refunded',
          align: 'right',
          render: (data) =>
            <Text size={1}>
              {data.amountRefunded && data.amountRefunded > 0
                ? formatCurrency(data.amountRefunded, data.currency ?? 'USD')
                : '—'}
            </Text>,
        },
        {
          key: 'created',
          header: 'Created',
          render: (data) => <Text size={1}>{formatDate(data.createdAt)}</Text>,
        },
      ]}
    />
  )
}
