import React, {useMemo, useState} from 'react'
import {Button, Flex, Text} from '@sanity/ui'
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
  emailMarketingSubscribed?: boolean | null
  communicationMarketingOptIn?: boolean | null
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
  "emailMarketingSubscribed": coalesce(emailMarketing.subscribed, false),
  "communicationMarketingOptIn": coalesce(communicationPreferences.marketingOptIn, false),
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

const isMarketingSubscribed = (data: CustomerRowData) =>
  Boolean(
    data.emailOptIn ||
      data.marketingOptIn ||
      data.emailMarketingSubscribed ||
      data.communicationMarketingOptIn,
  )

type SegmentFilterId = 'all' | 'vip' | 'repeat' | 'new' | 'at_risk' | 'inactive'

type SegmentFilterOption = {
  id: SegmentFilterId
  title: string
  filter?: string
  description: string
}

const SEGMENT_FILTERS: SegmentFilterOption[] = [
  {
    id: 'all',
    title: 'All',
    description: 'Show every customer',
  },
  {
    id: 'vip',
    title: 'VIP Customers',
    filter: '(segment == "vip") || coalesce(lifetimeValue, lifetimeSpend, 0) >= 10000',
    description: 'Lifetime value above $10k or marked as VIP',
  },
  {
    id: 'repeat',
    title: 'Repeat Customers',
    filter: '(segment == "repeat") || coalesce(totalOrders, orderCount, 0) >= 3',
    description: 'Three or more orders',
  },
  {
    id: 'new',
    title: 'New Customers',
    filter:
      '(segment == "new") || dateTime(coalesce(firstOrderDate, _createdAt)) >= dateTime(now()) - 60*60*24*30',
    description: 'Created within the last 30 days',
  },
  {
    id: 'at_risk',
    title: 'At Risk',
    filter:
      '(segment == "at_risk") || (coalesce(daysSinceLastOrder, 0) >= 180 && coalesce(daysSinceLastOrder, 0) < 365)',
    description: 'No orders for 6+ months',
  },
  {
    id: 'inactive',
    title: 'Inactive',
    filter: '(segment == "inactive") || coalesce(daysSinceLastOrder, 9999) >= 365',
    description: 'No orders for 12+ months',
  },
]

type CustomersDocumentTableProps = {
  title?: string
  filter?: string
  emptyState?: string
  pageSize?: number
  orderings?: Array<{field: string; direction: 'asc' | 'desc'}>
  apiVersion?: string
  showSegmentFilters?: boolean
}

export default function CustomersDocumentTable({
  title = 'Customers',
  filter,
  emptyState = 'No customers',
  pageSize = 10,
  orderings,
  apiVersion,
  showSegmentFilters = false,
}: CustomersDocumentTableProps = {}) {
  type CustomerRow = CustomerRowData & {_id: string; _type: string}
  const resolvedOrderings = orderings ?? [
    {field: '_updatedAt', direction: 'desc' as const},
    {field: '_createdAt', direction: 'desc' as const},
  ]
  const [activeSegmentId, setActiveSegmentId] = useState<SegmentFilterId>('all')

  const activeSegment = useMemo(
    () => SEGMENT_FILTERS.find((option) => option.id === activeSegmentId) || SEGMENT_FILTERS[0],
    [activeSegmentId],
  )

  const combinedFilter = useMemo(() => {
    const parts: string[] = []
    if (filter) {
      parts.push(`(${filter})`)
    }
    if (activeSegment.filter) {
      parts.push(`(${activeSegment.filter})`)
    }
    return parts.join(' && ') || undefined
  }, [filter, activeSegment])

  const resolvedEmptyState =
    showSegmentFilters && activeSegment.id !== 'all'
      ? `No ${activeSegment.title}`
      : emptyState

  const headerActions = showSegmentFilters ? (
    <Flex align="center" gap={2} wrap="wrap">
      <Text size={1} muted>
        Segment
      </Text>
      {SEGMENT_FILTERS.map((option) => (
        <Button
          key={option.id}
          text={option.title}
          tone={option.id === activeSegment.id ? 'primary' : undefined}
          mode={option.id === activeSegment.id ? 'default' : 'ghost'}
          onClick={() => setActiveSegmentId(option.id)}
        />
      ))}
    </Flex>
  ) : undefined

  return (
    <PaginatedDocumentTable<CustomerRowData>
      title={title}
      documentType="customer"
      projection={CUSTOMER_PROJECTION}
      orderings={resolvedOrderings}
      pageSize={pageSize}
      filter={combinedFilter}
      emptyState={resolvedEmptyState}
      apiVersion={apiVersion}
      headerActions={headerActions}
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
          render: (data: CustomerRow) => <Text size={1}>{formatBoolean(isMarketingSubscribed(data))}</Text>,
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
