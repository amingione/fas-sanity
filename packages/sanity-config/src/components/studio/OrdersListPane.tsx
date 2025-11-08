import React, {useEffect, useMemo, useState} from 'react'
import {
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
import {formatOrderNumber, orderNumberSearchTokens} from '../../utils/orderNumber'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './documentTables/DocumentBadge'
import {
  EXPIRED_SESSION_PANEL_TITLE,
  filterOutExpiredOrders,
  isExpiredOrder,
} from '../../utils/orderFilters'

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

type OrderFilter = 'all' | 'paid' | 'pending' | 'shipped' | 'cancelled' | 'refunded' | 'expired'

const ORDER_FILTER_LABELS: Record<OrderFilter, string> = {
  all: 'All',
  paid: 'Paid',
  pending: 'Pending',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  expired: EXPIRED_SESSION_PANEL_TITLE,
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

const includesAny = (value: string, patterns: string[]) =>
  patterns.some((pattern) => value.includes(pattern))

const FILTER_MATCHERS: Record<Exclude<OrderFilter, 'all'>, (value: string) => boolean> = {
  paid: (value) =>
    !includesAny(value, ['unpaid', 'not paid', 'incomplete']) &&
    includesAny(value, [
      'paid',
      'succeeded',
      'completed',
      'complete',
      'captured',
      'settled',
      'payment received',
      'payment_received',
      'paid in full',
      'paid_in_full',
    ]),
  pending: (value) =>
    includesAny(value, [
      'pending',
      'awaiting',
      'requires',
      'incomplete',
      'processing',
      'open',
      'on hold',
      'on-hold',
      'on_hold',
      'review',
      'authorized',
    ]),
  shipped: (value) =>
    includesAny(value, [
      'shipped',
      'shipping',
      'shipment',
      'fulfilled',
      'fulfillment',
      'deliver',
      'delivery',
      'in transit',
      'label created',
      'out for delivery',
      'ready for pickup',
      'picked up',
      'partially fulfilled',
      'partially shipped',
    ]) && !includesAny(value, ['not shipped', 'unshipped']),
  cancelled: (value) =>
    includesAny(value, ['cancel', 'void', 'return', 'returned', 'failed', 'declined', 'rejected']),
  refunded: (value) =>
    includesAny(value, ['refund', 'refunded', 'refunding', 'charge refunded', 'payment refunded']),
  expired: () => true,
}

const OrdersListPane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const sourceClient = useClient({apiVersion: '2024-10-01'})
  const client = useMemo(
    () => sourceClient.withConfig({perspective: 'drafts' as const}),
    [sourceClient],
  )
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<
    'all' | 'paid' | 'pending' | 'shipped' | 'cancelled' | 'refunded' | 'expired'
  >('all')
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

  const expiredOrders = useMemo(() => orders.filter((order) => isExpiredOrder(order)), [orders])
  const activeOrders = useMemo(() => filterOutExpiredOrders(orders), [orders])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    const dataset = filter === 'expired' ? expiredOrders : activeOrders

    return dataset.filter((order) => {
      const matchesTerm =
        !term ||
        orderNumberSearchTokens(order.orderNumber).some((token) =>
          token.toLowerCase().includes(term),
        ) ||
        order.customer?.name?.toLowerCase().includes(term)

      if (!matchesTerm) return false
      if (filter === 'all' || filter === 'expired') return true

      const matcher = FILTER_MATCHERS[filter]
      if (!matcher) return true

      const statuses = [
        order.status,
        order.paymentStatus,
        order.fulfillmentStatus,
        order.deliveryStatus,
      ]
        .map((value) => value?.toLowerCase() || null)
        .filter((value): value is string => Boolean(value))

      return statuses.some((value) => matcher(value))
    })
  }, [activeOrders, expiredOrders, search, filter])

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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    )
  }

  const filterLabel = ORDER_FILTER_LABELS[filter]
  const totalVisibleOrders = filter === 'expired' ? expiredOrders.length : activeOrders.length

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
                  {filteredOrders.length} shown · {totalVisibleOrders} total
                </Text>
              </Stack>
              <Button icon={DownloadIcon} mode="ghost" text="Export" />
            </Flex>

            <Flex justify="space-between" align="center" gap={3} wrap="wrap">
              <Box flex={1} style={{minWidth: 240}}>
                <TextInput
                  name="orderSearch"
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
                    <MenuItem text="Refunded" onClick={() => setFilter('refunded')} />
                    <MenuItem
                      text={EXPIRED_SESSION_PANEL_TITLE}
                      onClick={() => setFilter('expired')}
                    />
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
                  aria-label="Select all orders"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
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
                            label: formatBadgeLabel(order.status),
                            tone: resolveBadgeTone(order.status),
                          }
                        : null,
                      order.paymentStatus
                        ? {
                            key: 'payment-status',
                            label: formatBadgeLabel(order.paymentStatus),
                            tone: resolveBadgeTone(order.paymentStatus),
                          }
                        : null,
                      order.fulfillmentStatus
                        ? {
                            key: 'fulfillment-status',
                            label: formatBadgeLabel(order.fulfillmentStatus),
                            tone: resolveBadgeTone(order.fulfillmentStatus),
                          }
                        : null,
                      order.deliveryStatus
                        ? {
                            key: 'delivery-status',
                            label: formatBadgeLabel(order.deliveryStatus),
                            tone: resolveBadgeTone(order.deliveryStatus),
                          }
                        : null,
                    ].filter(
                      (
                        badge,
                      ): badge is {
                        key: string
                        label: string
                        tone: ReturnType<typeof resolveBadgeTone>
                      } => Boolean(badge && badge.label),
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
                          aria-label={`Select order ${formatOrderNumber(order.orderNumber) || order._id}`}
                        />
                        <Text size={2} style={{flex: 1}}>
                          {formatOrderNumber(order.orderNumber) || '—'}
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
                                    <DocumentBadge
                                      key={badge.key}
                                      label={badge.label}
                                      tone={badge.tone}
                                    />
                                  ))}
                                </Flex>
                              )}
                              {tagBadges.length > 0 && (
                                <Flex gap={1} style={{flexWrap: 'wrap'}}>
                                  {tagBadges.map((tag) => (
                                    <DocumentBadge
                                      key={tag}
                                      label={toTitleCase(tag)}
                                      tone="primary"
                                    />
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
