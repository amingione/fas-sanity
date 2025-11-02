import React from 'react'
import {Text} from '@sanity/ui'
import {
  PaginatedDocumentTable,
  formatBoolean,
  formatCurrency,
  formatDate,
} from './PaginatedDocumentTable'

type CustomerRowData = {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  orderCount?: number | null
  lifetimeSpend?: number | null
  emailOptIn?: boolean | null
  marketingOptIn?: boolean | null
  city?: string | null
  state?: string | null
  updatedAt?: string | null
}

const CUSTOMER_PROJECTION = `{
  firstName,
  lastName,
  email,
  orderCount,
  lifetimeSpend,
  emailOptIn,
  marketingOptIn,
  "city": shippingAddress.city,
  "state": shippingAddress.state,
  "updatedAt": coalesce(updatedAt, _updatedAt, _createdAt)
}`

const formatName = (data: CustomerRowData) => {
  const parts = [data.firstName, data.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return data.email || 'Customer'
}

const formatLocation = (data: CustomerRowData) => {
  const parts = [data.city, data.state].filter((value) => value && value.trim())
  return parts.length ? parts.join(', ') : '—'
}

export default function CustomersDocumentTable() {
  type CustomerRow = CustomerRowData & {_id: string; _type: string}

  return (
    <PaginatedDocumentTable<CustomerRowData>
      title="Customers"
      documentType="customer"
      projection={CUSTOMER_PROJECTION}
      orderings={[{field: '_updatedAt', direction: 'desc'}]}
      pageSize={8}
      columns={[
        {
          key: 'name',
          header: 'Customer',
          render: (data: CustomerRow) => (
            <Text size={1} weight="medium">
              {formatName(data)}
            </Text>
          ),
        },
        {
          key: 'email',
          header: 'Email',
          render: (data: CustomerRow) => <Text size={1}>{data.email || '—'}</Text>,
        },
        {
          key: 'location',
          header: 'Location',
          render: (data: CustomerRow) => <Text size={1}>{formatLocation(data)}</Text>,
        },
        {
          key: 'orders',
          header: 'Orders',
          align: 'right',
          render: (data: CustomerRow) => <Text size={1}>{data.orderCount ?? 0}</Text>,
        },
        {
          key: 'lifetimeSpend',
          header: 'Lifetime Spend',
          align: 'right',
          render: (data: CustomerRow) => (
            <Text size={1}>{formatCurrency(data.lifetimeSpend ?? null, 'USD')}</Text>
          ),
        },
        {
          key: 'marketing',
          header: 'Marketing Opt-In',
          render: (data: CustomerRow) => (
            <Text size={1}>
              {formatBoolean(Boolean(data.emailOptIn || data.marketingOptIn))}
            </Text>
          ),
        },
        {
          key: 'updated',
          header: 'Updated',
          render: (data: CustomerRow) => <Text size={1}>{formatDate(data.updatedAt)}</Text>,
        },
      ]}
    />
  )
}
