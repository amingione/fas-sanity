import React, {useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {DownloadIcon, FilterIcon, SearchIcon} from '@sanity/icons'
import {useClient} from 'sanity'

type OrderRecord = {
  _id: string
  orderNumber?: string | null
  orderDate?: string | null
  status?: string | null
  total?: number | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  fulfillmentStatus?: string | null
  deliveryStatus?: string | null
  tags?: string[] | null
  customer?: {
    name?: string | null
  } | null
}

const ORDER_QUERY = `*[_type == "order"] | order(orderDate desc)[0...250]{
  _id,
  orderNumber,
  orderDate,
  status,
  total,
  paymentMethod,
  paymentStatus,
  fulfillmentStatus,
  deliveryStatus,
  tags,
  customer->{name}
}`

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number') return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  try {
    const formatted = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
    return formatted
  } catch {
    return value
  }
}

const toTitleCase = (value?: string | null) => {
  if (!value) return ''
  return value
    .toString()
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const badgeTone = (
  status?: string | null,
): 'default' | 'positive' | 'caution' | 'critical' => {
  if (!status) return 'default'
  const normalized = status.toLowerCase()
  if (['paid', 'fulfilled', 'delivered', 'succeeded', 'completed'].includes(normalized)) return 'positive'
  if (['pending', 'processing', 'in transit', 'label created'].includes(normalized)) return 'caution'
  if (
    [
      'cancelled',
      'canceled',
      'returned',
      'refunded',
      'failed',
      'exception',
      'void',
      'expired',
    ].includes(normalized)
  )
    return 'critical'
  return 'default'
}

const OrdersListPane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending' | 'shipped' | 'cancelled'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    client
      .fetch<OrderRecord[]>(ORDER_QUERY)
      .then((result) => {
        if (cancelled) return
        setOrders(result || [])
      })
      .catch((err) => {
        if (cancelled) return
        console.error('OrdersListPane: failed to load orders', err)
        setError('Unable to load orders right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()

    return orders.filter((order) => {
      const matchesTerm =
        !term ||
        order.orderNumber?.toLowerCase().includes(term) ||
        order.customer?.name?.toLowerCase().includes(term)

      if (!matchesTerm) return false
      if (filter === 'all') return true
      return order.status?.toLowerCase() === filter
    })
  }, [orders, search, filter])

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredOrders.some((order) => order._id === id)))
  }, [filteredOrders])

  const allSelected = filteredOrders.length > 0 && selectedIds.length === filteredOrders.length

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredOrders.map((order) => order._id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }

  const filterLabel = {
    all: 'All',
    paid: 'Paid',
    pending: 'Pending',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
  }[filter]

  return (
    <Box ref={ref} padding={[4, 5, 6]}>
      <Stack space={4}>
        <Card padding={[4, 4, 5]} radius={3} shadow={1} tone="transparent">
          <Stack space={4}>
            <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
              <Stack space={1}>
                <Text size={4} weight="semibold">
                  Orders
                </Text>
                <Text muted size={1}>
                  {filteredOrders.length} shown · {orders.length} total
                </Text>
              </Stack>
              <Button icon={DownloadIcon} mode="ghost" text="Export" />
            </Flex>

            <Flex justify="space-between" align="center" gap={3} wrap="wrap">
              <Box flex={1} style={{minWidth: 240}}>
                <TextInput
                  icon={SearchIcon}
                  placeholder="Search orders by number or customer"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </Box>
              <MenuButton
                id="order-filter-menu"
                button={<Button icon={FilterIcon} text={`Status: ${filterLabel}`} mode="ghost" />}
                popover={{portal: true}}
                menu={
                  <Menu>
                    <MenuItem text="All" onClick={() => setFilter('all')} />
                    <MenuItem text="Paid" onClick={() => setFilter('paid')} />
                    <MenuItem text="Pending" onClick={() => setFilter('pending')} />
                    <MenuItem text="Shipped" onClick={() => setFilter('shipped')} />
                    <MenuItem text="Cancelled" onClick={() => setFilter('cancelled')} />
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
                <Checkbox aria-label="Select all orders" checked={allSelected} onChange={toggleSelectAll} />
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Order #
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Customer
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Date
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Status
                </Text>
                <Text size={1} weight="semibold" style={{flex: 1}}>
                  Total
                </Text>
              </Flex>

              <Box style={{overflowY: 'auto', maxHeight: '60vh'}}>
                <Stack space={0}>
                  {filteredOrders.map((order, index) => {
                    const selected = selectedIds.includes(order._id)
                    const statusBadges = [
                      order.status
                        ? {
                            key: 'order-status',
                            label: toTitleCase(order.status),
                            tone: badgeTone(order.status),
                          }
                        : null,
                      order.paymentStatus
                        ? {
                            key: 'payment-status',
                            label: `Payment: ${toTitleCase(order.paymentStatus)}`,
                            tone: badgeTone(order.paymentStatus),
                          }
                        : null,
                      order.fulfillmentStatus
                        ? {
                            key: 'fulfillment-status',
                            label: `Fulfillment: ${toTitleCase(order.fulfillmentStatus)}`,
                            tone: badgeTone(order.fulfillmentStatus),
                          }
                        : null,
                      order.deliveryStatus
                        ? {
                            key: 'delivery-status',
                            label: `Delivery: ${toTitleCase(order.deliveryStatus)}`,
                            tone: badgeTone(order.deliveryStatus),
                          }
                        : null,
                    ].filter((badge): badge is {key: string; label: string; tone: 'default' | 'positive' | 'caution' | 'critical'} =>
                      Boolean(badge),
                    )

                    const tagBadges = Array.isArray(order.tags)
                      ? order.tags
                          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
                          .filter((tag): tag is string => Boolean(tag))
                      : []

                    return (
                      <Flex
                        key={order._id}
                        align="center"
                        gap={3}
                        paddingY={3}
                        paddingX={[3, 3, 4]}
                        style={{
                          borderBottom:
                            index === filteredOrders.length - 1
                              ? 'none'
                              : '1px solid var(--card-border-color)',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleSelect(order._id)}
                      >
                        <Checkbox
                          checked={selected}
                          onChange={(event) => {
                            event.stopPropagation()
                            toggleSelect(order._id)
                          }}
                          aria-label={`Select order ${order.orderNumber || order._id}`}
                        />
                        <Text size={2} style={{flex: 1}}>
                          {order.orderNumber || '—'}
                        </Text>
                        <Text size={1} muted style={{flex: 1}}>
                          {order.customer?.name || '—'}
                        </Text>
                        <Text size={1} style={{flex: 1}}>
                          {formatDate(order.orderDate)}
                        </Text>
                        <Box style={{flex: 1}}>
                          {statusBadges.length || tagBadges.length ? (
                            <Stack space={2}>
                              {statusBadges.length > 0 && (
                                <Flex gap={2} style={{flexWrap: 'wrap'}}>
                                  {statusBadges.map((badge) => (
                                    <Badge
                                      key={badge.key}
                                      tone={badge.tone}
                                      padding={1}
                                      radius={2}
                                      fontSize={0}
                                      style={{lineHeight: 1}}
                                    >
                                      {badge.label}
                                    </Badge>
                                  ))}
                                </Flex>
                              )}
                              {tagBadges.length > 0 && (
                                <Flex gap={1} style={{flexWrap: 'wrap'}}>
                                  {tagBadges.map((tag) => (
                                    <Badge
                                      key={tag}
                                      tone="default"
                                      mode="outline"
                                      padding={1}
                                      radius={2}
                                      fontSize={0}
                                      style={{lineHeight: 1}}
                                    >
                                      {toTitleCase(tag)}
                                    </Badge>
                                  ))}
                                </Flex>
                              )}
                            </Stack>
                          ) : (
                            <Text size={1} muted>
                              —
                            </Text>
                          )}
                        </Box>
                        <Text size={1} style={{flex: 1}}>
                          {formatCurrency(order.total)}
                        </Text>
                      </Flex>
                    )
                  })}

                  {filteredOrders.length === 0 && (
                    <Card padding={4} tone="transparent">
                      <Text muted>No orders found for the current filters.</Text>
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

OrdersListPane.displayName = 'OrdersListPane'

export default OrdersListPane
