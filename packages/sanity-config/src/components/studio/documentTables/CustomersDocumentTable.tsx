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

const isMarketingSubscribed = (data: CustomerRowData) =>
  Boolean(
    data.emailOptIn ||
      data.marketingOptIn ||
      data.emailMarketingSubscribed ||
      data.communicationMarketingOptIn,
  )

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

  const combinedFilter = useMemo(() => {
    const parts: string[] = []
    if (filter) {
      parts.push(`(${filter})`)
    }
    // Add search filter
    if (searchQuery.trim()) {
      const searchTerm = searchQuery.trim().toLowerCase()
      parts.push(
        `(lower(firstName) match "*${searchTerm}*" || lower(lastName) match "*${searchTerm}*" || lower(email) match "*${searchTerm}*")`,
      )
    }
    return parts.join(' && ') || undefined
  }, [filter, searchQuery])

  const handleAddCustomer = () => {
    router.navigateIntent('create', {type: 'customer'})
  }

  const headerActions = (
    <Flex align="center" gap={3} wrap="wrap">
      {/* Search Bar */}
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

      {/* Segment Filters */}

      {/* Add Customer Button */}
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
                <Badge tone="positive" style={{fontSize: '11px'}}>
                  Subscribed
                </Badge>
              )}
              {(data.orderCount ?? 0) === 0 && (
                <Badge tone="caution" style={{fontSize: '11px'}}>
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
