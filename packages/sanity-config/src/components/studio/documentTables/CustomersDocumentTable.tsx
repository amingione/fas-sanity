import React, {useMemo, useState} from 'react'
import {Badge, Box, Button, Flex, Stack, Text, TextInput, Tooltip} from '@sanity/ui'
import {SearchIcon, AddIcon} from '@sanity/icons'
import {useRouter} from 'sanity/router'
import {PaginatedDocumentTable} from './PaginatedDocumentTable'

type CustomerRowData = {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  orderCount?: number | null
  lifetimeSpend?: number | null
  emailMarketingSubscribed?: boolean | null
  communicationMarketingOptIn?: boolean | null
  communicationSmsOptIn?: boolean | null
  customerStatus?: string | null
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
  "emailMarketingSubscribed": coalesce(emailMarketing.subscribed, false),
  "communicationMarketingOptIn": coalesce(communicationPreferences.marketingOptIn, false),
  "communicationSmsOptIn": coalesce(communicationPreferences.smsOptIn, false),
  "customerStatus": coalesce(customerStatus, 'visitor'),
  "city": shippingAddress.city,
  "state": shippingAddress.state,
  "updatedAt": coalesce(updatedAt, _updatedAt, _createdAt)
}`

const formatName = (data: CustomerRowData) => {
  const parts = [data.firstName, data.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return data.email || 'Customer'
}

const isMarketingSubscribed = (data: CustomerRowData) =>
  Boolean(
    data.emailMarketingSubscribed ||
      data.communicationMarketingOptIn ||
      data.communicationSmsOptIn,
  )

const isSmsSubscribed = (data: CustomerRowData) => Boolean(data.communicationSmsOptIn)

type CustomerTab = 'customers' | 'visitors'

const TAB_OPTIONS: Array<{id: CustomerTab; label: string}> = [
  {id: 'customers', label: 'Customers'},
  {id: 'visitors', label: 'Visitors / expired carts'},
]

const TAB_FILTERS: Record<CustomerTab, string> = {
  customers: `coalesce(customerStatus, "visitor") in ["customer","vip"]`,
  visitors: `coalesce(customerStatus, "visitor") == "visitor" && coalesce(orderCount, 0) == 0`,
}

const customerStatusTone = (status?: string | null) => {
  switch (status) {
    case 'vip':
      return 'critical'
    case 'customer':
      return 'positive'
    case 'visitor':
    default:
      return 'default'
  }
}

const customerStatusLabel = (status?: string | null) => {
  switch (status) {
    case 'vip':
      return 'VIP'
    case 'customer':
      return 'Customer'
    case 'visitor':
    default:
      return 'Visitor'
  }
}

type CustomersDocumentTableProps = {
  title?: string
  filter?: string
  emptyState?: string
  pageSize?: number
  orderings?: Array<{field: string; direction: 'asc' | 'desc'}>
  apiVersion?: string
}

export default function CustomersDocumentTable({
  title = 'Customers',
  filter,
  emptyState = 'No customers',
  pageSize = 10,
  orderings,
  apiVersion,
}: CustomersDocumentTableProps = {}) {
  type CustomerRow = CustomerRowData & {_id: string; _type: string}
  const router = useRouter()
  const resolvedOrderings = orderings ?? [
    {field: '_updatedAt', direction: 'desc' as const},
    {field: '_createdAt', direction: 'desc' as const},
  ]
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<CustomerTab>('customers')

  const combinedFilter = useMemo(() => {
    const parts: string[] = []
    if (filter) {
      parts.push(`(${filter})`)
    }
    if (searchQuery.trim()) {
      const term = searchQuery.trim().toLowerCase()
      parts.push(
        `(lower(firstName) match "*${term}*" || lower(lastName) match "*${term}*" || lower(email) match "*${term}*")`,
      )
    }
    parts.push(`(${TAB_FILTERS[activeTab]})`)
    return parts.join(' && ') || undefined
  }, [filter, searchQuery, activeTab])

  const handleAddCustomer = () => {
    router.navigateIntent('create', {type: 'customer'})
  }

  const headerActions = (
    <Stack space={3}>
      <Flex align="center" gap={2} wrap="wrap">
        {TAB_OPTIONS.map((tab) => (
          <Button
            key={tab.id}
            text={tab.label}
            mode={activeTab === tab.id ? 'default' : 'ghost'}
            tone={activeTab === tab.id ? 'primary' : 'default'}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </Flex>
      <Flex align="center" gap={3} wrap="wrap">
        <Box flex={1} style={{minWidth: '200px', maxWidth: '400px'}}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            clearButton
            onClear={() => setSearchQuery('')}
          />
        </Box>
        <Tooltip
          content={
            <Box padding={1}>
              <Text muted size={1}>
                Add customer
              </Text>
            </Box>
          }
          placement="top"
          portal
        >
          <span style={{display: 'inline-flex'}}>
            <Button
              icon={AddIcon}
              tone="primary"
              mode="ghost"
              onClick={handleAddCustomer}
              aria-label="Add customer"
            />
          </span>
        </Tooltip>
      </Flex>
    </Stack>
  )

  return (
    <PaginatedDocumentTable<CustomerRowData>
      title={title}
      documentType="customer"
      projection={CUSTOMER_PROJECTION}
      orderings={resolvedOrderings}
      pageSize={pageSize}
      filter={combinedFilter}
      emptyState={emptyState}
      apiVersion={apiVersion}
      headerActions={headerActions}
      columns={[
        {
          key: 'name',
          header: 'Customer',
          render: (data: CustomerRow) => (
            <Stack space={2}>
              <Text size={1} weight="medium">
                {formatName(data)}
              </Text>
              {data.email && (
                <Text size={1} muted>
                  {data.email}
                </Text>
              )}
            </Stack>
          ),
        },
        {
          key: 'orders',
          header: 'Orders',
          align: 'right',
          render: (data: CustomerRow) => <Text size={1}>{data.orderCount ?? 0}</Text>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (data: CustomerRow) => (
            <Flex gap={2} wrap="wrap">
              {isMarketingSubscribed(data) && (
                <Badge tone="positive" size={1} mode="outline">
                  Subscribed
                </Badge>
              )}
              {isSmsSubscribed(data) && (
                <Badge tone="primary" size={1} mode="outline">
                  SMS Opt-in
                </Badge>
              )}
              {data.customerStatus && (
                <Badge tone={customerStatusTone(data.customerStatus)} size={1} mode="outline">
                  {customerStatusLabel(data.customerStatus)}
                </Badge>
              )}
              {(data.orderCount ?? 0) === 0 && (
                <Badge tone="caution" size={1} mode="outline">
                  No Orders
                </Badge>
              )}
            </Flex>
          ),
        },
      ]}
    />
  )
}
