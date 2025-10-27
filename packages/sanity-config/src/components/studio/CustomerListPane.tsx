import React, {useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  TextInput,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {
  AddIcon,
  CheckmarkIcon,
  DownloadIcon,
  FilterIcon,
  SearchIcon,
  UploadIcon,
} from '@sanity/icons'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

interface BasicAddress {
  city?: string | null
  state?: string | null
  country?: string | null
}

interface CustomerRecord {
  _id: string
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  orderCount?: number | null
  lifetimeSpend?: number | null
  roles?: string[] | null
  emailOptIn?: boolean | null
  marketingOptIn?: boolean | null
  shippingAddress?: BasicAddress | null
  address?: string | null
  location?: string | null
  updatedAt?: string | null
}

const CUSTOMER_LIST_QUERY = `*[_type == "customer"] | order(coalesce(firstName + " " + lastName, name, email) asc)[0...250]{
  _id,
  firstName,
  lastName,
  name,
  email,
  phone,
  orderCount,
  lifetimeSpend,
  roles,
  emailOptIn,
  marketingOptIn,
  shippingAddress{city,state,country},
  address,
  updatedAt
}`

const buildDisplayName = (customer: CustomerRecord): string => {
  const composed = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
  return composed || customer.name || customer.email || 'Unnamed customer'
}

const buildLocation = (customer: CustomerRecord): string => {
  const addr = customer.shippingAddress
  const parts = [addr?.city, addr?.state, addr?.country].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (customer.address) {
    const condensed = customer.address
      .split(/\n|,/)
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (condensed.length > 0) return condensed[0]
  }
  return '—'
}

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number') return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

const CustomerListPane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()

  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'subscribed' | 'highValue' | 'inactive'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    client
      .fetch<CustomerRecord[]>(CUSTOMER_LIST_QUERY)
      .then((result) => {
        if (cancelled) return
        const mapped = (result || []).map((customer) => ({
          ...customer,
          location: buildLocation(customer),
        }))
        setCustomers(mapped)
        setActiveCustomerId((previous) => previous || mapped[0]?._id || null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('CustomerListPane: failed to load customers', err)
        setError('Unable to load customers right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client])

  const filteredCustomers = useMemo(() => {
    let next = customers

    if (filter === 'subscribed') {
      next = next.filter((customer) => Boolean(customer.emailOptIn || customer.marketingOptIn))
    } else if (filter === 'highValue') {
      next = next.filter((customer) => (customer.lifetimeSpend ?? 0) >= 100)
    } else if (filter === 'inactive') {
      next = next.filter((customer) => (customer.orderCount ?? 0) === 0)
    }

    if (query.trim()) {
      const term = query.trim().toLowerCase()
      next = next.filter((customer) => {
        const haystack = [
          buildDisplayName(customer),
          customer.email || '',
          customer.phone || '',
          (customer.roles || []).join(' '),
          customer.location || '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
    }

    return next
  }, [customers, filter, query])

  useEffect(() => {
    if (!activeCustomerId && filteredCustomers.length > 0) {
      setActiveCustomerId(filteredCustomers[0]._id)
    } else if (activeCustomerId && !filteredCustomers.some((customer) => customer._id === activeCustomerId)) {
      setActiveCustomerId(filteredCustomers[0]?._id || null)
    }
  }, [filteredCustomers, activeCustomerId])

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredCustomers.some((customer) => customer._id === id)))
  }, [filteredCustomers])

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

  const filterOptions: Array<{value: typeof filter; label: string; description?: string}> = [
    {value: 'all', label: 'All customers'},
    {value: 'subscribed', label: 'Subscribed to email'},
    {value: 'highValue', label: 'Spent $100+'},
    {value: 'inactive', label: 'No orders yet'},
  ]

  const selectedFilter = filterOptions.find((option) => option.value === filter)

  const stats = {
    total: customers.length,
    filtered: filteredCustomers.length,
    highValue: customers.filter((customer) => (customer.lifetimeSpend ?? 0) >= 100).length,
  }

  const subscriptionBadge = (customer: CustomerRecord) => {
    const subscribed = Boolean(customer.emailOptIn || customer.marketingOptIn)
    return subscribed ? (
      <Badge radius={2} tone="positive" padding={2} fontSize={1}>
        Subscribed
      </Badge>
    ) : (
      <Badge radius={2} tone="default" padding={2} fontSize={1}>
        Not subscribed
      </Badge>
    )
  }

  const handleMenuAction = (action: 'create' | 'list') => {
    if (action === 'create') {
      router.navigateIntent('create', {type: 'customer'})
    } else {
      router.navigateIntent('type', {type: 'customer'})
    }
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value)
  }

  const handleFilterChange = (value: typeof filter) => {
    setFilter(value)
  }

  return (
    <Box ref={ref} padding={[4, 5, 6]}>
      <Stack space={4}>
        <Card padding={[4, 4, 5]} radius={3} shadow={1} tone="transparent">
          <Stack space={4}>
            <Flex
              align={['flex-start', 'center']}
              justify="space-between"
              gap={4}
              style={{flexWrap: 'wrap'}}
            >
              <Stack space={2}>
                <Flex gap={2} align="center" style={{flexWrap: 'wrap'}}>
                  <Text size={4} weight="semibold">
                    Customers
                  </Text>
                  <Badge padding={2} radius={2} tone="primary" fontSize={1}>
                    {stats.filtered.toLocaleString()} shown
                  </Badge>
                </Flex>
                <Text muted size={1}>
                  {stats.total.toLocaleString()} total · {stats.highValue.toLocaleString()} high-value customers
                </Text>
              </Stack>
              <Flex gap={2} style={{flexWrap: 'wrap'}}>
                <Button
                  icon={DownloadIcon}
                  mode="ghost"
                  text="Export"
                  fontSize={1}
                  onClick={() => console.info('Export customers')}
                />
                <Button
                  icon={UploadIcon}
                  mode="ghost"
                  text="Import"
                  fontSize={1}
                  onClick={() => console.info('Import customers')}
                />
                <Button
                  icon={AddIcon}
                  text="Add customer"
                  fontSize={1}
                  tone="primary"
                  onClick={() => handleMenuAction('create')}
                />
              </Flex>
            </Flex>

            <Flex gap={3} align="center" style={{flexWrap: 'wrap'}}>
              <Box flex={1} style={{minWidth: 240}}>
                <TextInput
                  fontSize={1}
                  icon={SearchIcon}
                  radius={2}
                  value={query}
                  onChange={handleSearchChange}
                  placeholder="Search customers"
                />
              </Box>
              <MenuButton
                id="customer-filter"
                button={<Button icon={FilterIcon} text={`Filter: ${selectedFilter?.label ?? 'All'}`} mode="ghost" />}
                popover={{portal: true}}
                menu={
                  <Menu>
                    {filterOptions.map((option) => (
                      <MenuItem
                        key={option.value}
                        text={option.label}
                        icon={option.value === filter ? CheckmarkIcon : undefined}
                        onClick={() => handleFilterChange(option.value)}
                      />
                    ))}
                    <MenuDivider />
                    <MenuItem text="Clear filters" tone="critical" onClick={() => handleFilterChange('all')} />
                  </Menu>
                }
              />
              <MenuButton
                id="customer-actions"
                button={<Button text="More actions" mode="ghost" />}
                popover={{portal: true}}
                menu={
                  <Menu>
                    <MenuItem text="View all in desk" onClick={() => handleMenuAction('list')} />
                    <MenuDivider />
                    <MenuItem text="Select none" onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0} />
                  </Menu>
                }
              />
            </Flex>
          </Stack>
        </Card>

        {loading ? (
          <Flex align="center" justify="center" style={{minHeight: 200}}>
            <Spinner muted size={4} />
          </Flex>
        ) : error ? (
          <Card padding={4} radius={3} shadow={1} tone="critical">
            <Text>{error}</Text>
          </Card>
        ) : (
          <Card radius={3} shadow={1} tone="transparent" style={{overflow: 'hidden'}}>
            <Stack space={0}>
              <Flex
                align="center"
                gap={3}
                paddingY={3}
                paddingX={[3, 3, 4]}
                style={{borderBottom: '1px solid var(--card-border-color)'}}
              >
                <Checkbox
                  aria-label="Select all customers"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                <Text size={1} weight="semibold" style={{flex: 2}}>
                  Customer
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Subscription
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Location
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Orders
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Lifetime spend
                </Text>
              </Flex>

              <Box style={{overflowY: 'auto', maxHeight: '60vh'}}>
                <Stack space={0}>
                  {filteredCustomers.map((customer, index) => {
                    const selected = selectedIds.includes(customer._id)
                    const location = customer.location || buildLocation(customer)

                    return (
                      <Flex
                        key={customer._id}
                        align="center"
                        gap={3}
                        paddingY={3}
                        paddingX={[3, 3, 4]}
                        style={{
                          borderBottom:
                            index === filteredCustomers.length - 1
                              ? 'none'
                              : '1px solid var(--card-border-color)',
                          cursor: 'pointer',
                          backgroundColor:
                            activeCustomerId === customer._id
                              ? 'var(--card-muted-bg-color)'
                              : undefined,
                        }}
                        onClick={() => setActiveCustomerId(customer._id)}
                      >
                        <Checkbox
                          checked={selected}
                          onChange={(event) => {
                            event.stopPropagation()
                            toggleSelect(customer._id)
                          }}
                          aria-label={`Select ${buildDisplayName(customer)}`}
                        />
                        <Stack space={1} style={{flex: 2}}>
                          <Text size={2} weight="medium">
                            {buildDisplayName(customer)}
                          </Text>
                          {customer.email && (
                            <Text size={1} muted>
                              {customer.email}
                            </Text>
                          )}
                        </Stack>
                        <Box style={{flex: 1}}>{subscriptionBadge(customer)}</Box>
                        <Text size={1} style={{flex: 1}}>
                          {location}
                        </Text>
                        <Text size={1} style={{flex: 1}}>
                          {customer.orderCount ?? 0}
                        </Text>
                        <Text size={1} style={{flex: 1}}>
                          {formatCurrency(customer.lifetimeSpend)}
                        </Text>
                      </Flex>
                    )
                  })}

                  {filteredCustomers.length === 0 && (
                    <Card padding={4} tone="transparent">
                      <Text muted>No customers match your current filters.</Text>
                    </Card>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Card>
        )}
      </Stack>
    </Box>
  )
})

CustomerListPane.displayName = 'CustomerListPane'

export default CustomerListPane
