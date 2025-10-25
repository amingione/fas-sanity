import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {SortIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {usePaneRouter} from 'sanity/desk'

type OrderListItem = {
  _id: string
  _updatedAt?: string
  createdAt?: string
  orderNumber?: string
  customerName?: string
  customerEmail?: string
  totalAmount?: number
  paymentStatus?: string
  status?: string
  shippingCarrier?: string
  selectedService?: {
    service?: string
    amount?: number
    currency?: string
  }
}

const STATUS_META: Record<
  string,
  {
    label: string
    tone: 'default' | 'positive' | 'critical' | 'caution'
  }
> = {
  paid: {label: 'Paid', tone: 'positive'},
  fulfilled: {label: 'Fulfilled', tone: 'positive'},
  shipped: {label: 'Shipped', tone: 'positive'},
  cancelled: {label: 'Cancelled', tone: 'critical'},
  refunded: {label: 'Refunded', tone: 'caution'},
  closed: {label: 'Closed', tone: 'default'},
  expired: {label: 'Expired', tone: 'default'},
}

const FILTER_OPTIONS = [
  {id: 'all', title: 'All statuses'},
  {id: 'paid', title: 'Paid'},
  {id: 'fulfilled', title: 'Fulfilled'},
  {id: 'shipped', title: 'Shipped'},
  {id: 'cancelled', title: 'Cancelled'},
  {id: 'refunded', title: 'Refunded'},
  {id: 'closed', title: 'Closed'},
]

const SORT_OPTIONS = [
  {
    id: 'createdDesc',
    title: 'Newest first',
    orderBy: 'coalesce(createdAt, _createdAt) desc',
  },
  {
    id: 'createdAsc',
    title: 'Oldest first',
    orderBy: 'coalesce(createdAt, _createdAt) asc',
  },
  {
    id: 'totalDesc',
    title: 'Order total (high → low)',
    orderBy: 'coalesce(totalAmount, amountSubtotal, 0) desc',
  },
]

const DEFAULT_SORT = SORT_OPTIONS[0]

const formatCurrency = (value?: number, currency: string = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

const formatDate = (value?: string) => {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const STATUS_ALL = '__ALL__'

const LIST_QUERY = `
  *[_type == "order" && ($status == "${STATUS_ALL}" || status == $status)]
    | order($orderBy) [0...200]{
      _id,
      _updatedAt,
      createdAt,
      orderNumber,
      customerName,
      customerEmail,
      totalAmount,
      paymentStatus,
      status,
      shippingCarrier,
      selectedService
    }
`

export default function OrderListPane() {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = usePaneRouter()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortId, setSortId] = useState<string>(DEFAULT_SORT.id)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const sortOption = SORT_OPTIONS.find((opt) => opt.id === sortId) || DEFAULT_SORT
  const groqParams = useMemo(
    () => ({
      status: statusFilter === 'all' ? STATUS_ALL : statusFilter,
      orderBy: sortOption.orderBy,
    }),
    [sortOption.orderBy, statusFilter],
  )

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await client.fetch<OrderListItem[]>(LIST_QUERY, groqParams)
      setOrders(result || [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load orders')
    } finally {
      setLoading(false)
    }
  }, [client, groqParams])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const openOrder = useCallback(
    (orderId: string) => {
      router?.navigateIntent?.('edit', {id: orderId, type: 'order'})
    },
    [router],
  )

  return (
    <Stack space={4} padding={4}>
      <Flex align="center" justify="space-between">
        <Stack space={2}>
          <Text size={3} weight="semibold">
            Orders
          </Text>
          <Text muted size={1}>
            Website checkouts synced from Stripe. Status badges update automatically from webhooks.
          </Text>
        </Stack>

        <MenuButton
          id="order-sort-button"
          button={<Button icon={SortIcon} mode="bleed" tone="default" title="Sort & filter" />}
          menu={
            <Menu>
              <Text size={1} paddingX={3} paddingTop={2} muted>
                Sort by
              </Text>
              {SORT_OPTIONS.map((option) => (
                <MenuItem
                  key={option.id}
                  text={option.title}
                  icon={option.id === sortId ? undefined : undefined}
                  tone={option.id === sortId ? 'primary' : 'default'}
                  onClick={() => setSortId(option.id)}
                />
              ))}
              <MenuDivider />
              <Text size={1} paddingX={3} paddingTop={2} muted>
                Filter status
              </Text>
              {FILTER_OPTIONS.map((option) => {
                const filterMeta =
                  option.id === 'all'
                    ? {label: 'All', tone: 'default' as const}
                    : STATUS_META[option.id] || {
                        label: option.title,
                        tone: 'default' as const,
                      }
                return (
                  <MenuItem
                    key={option.id}
                    text={option.title}
                    onClick={() => setStatusFilter(option.id)}
                    tone={option.id === statusFilter ? 'primary' : 'default'}
                    padding={3}
                    icon={
                      option.id === 'all'
                        ? undefined
                        : () => (
                            <Badge
                              tone={filterMeta.tone}
                              mode="outline"
                              fontSize={0}
                              style={{textTransform: 'uppercase'}}
                            >
                              {filterMeta.label}
                            </Badge>
                          )
                    }
                  />
                )
              })}
            </Menu>
          }
        />
      </Flex>

      {loading ? (
        <Flex align="center" justify="center" paddingY={6}>
          <Spinner />
        </Flex>
      ) : error ? (
        <Card padding={4} radius={3} tone="critical" shadow={1}>
          <Text>{error}</Text>
          <Box marginTop={3}>
            <Button text="Retry" tone="primary" onClick={fetchOrders} />
          </Box>
        </Card>
      ) : orders.length === 0 ? (
        <Card padding={4} radius={3} tone="default" border>
          <Stack space={3}>
            <Text weight="semibold">No orders found</Text>
            <Text muted size={1}>
              Try a different filter or confirm Stripe webhooks are delivering order data.
            </Text>
            <Box>
              <Button text="Clear filter" onClick={() => setStatusFilter('all')} />
            </Box>
          </Stack>
        </Card>
      ) : (
        <Stack space={3}>
          {orders.map((order) => {
            const createdLabel = formatDate(order.createdAt || order._updatedAt)
            const statusMeta = STATUS_META[order.status || ''] || {
              label: order.status || 'Unknown',
              tone: 'default' as const,
            }
            return (
              <Card
                key={order._id}
                padding={4}
                radius={3}
                shadow={1}
                tone="default"
                as="button"
                style={{
                  textAlign: 'left',
                  width: '100%',
                  border: 'none',
                  background: 'var(--card-bg-color)',
                  cursor: 'pointer',
                }}
                onClick={() => openOrder(order._id)}
              >
                <Stack space={3}>
                  <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
                    <Stack space={1}>
                      <Text weight="semibold">
                        {order.orderNumber ? `Order ${order.orderNumber}` : order._id}
                      </Text>
                      <Text size={1} muted>
                        {createdLabel}
                      </Text>
                    </Stack>
                    <Badge
                      tone={statusMeta.tone}
                      mode="outline"
                      fontSize={0}
                      style={{textTransform: 'uppercase'}}
                    >
                      {statusMeta.label}
                    </Badge>
                  </Flex>

                  <Grid columns={[1, 1, 3]} gap={3}>
                    <Stack space={1}>
                      <Text muted size={1}>
                        Customer
                      </Text>
                      <Text>{order.customerName || order.customerEmail || '—'}</Text>
                    </Stack>
                    <Stack space={1}>
                      <Text muted size={1}>
                        Amount
                      </Text>
                      <Text>{formatCurrency(order.totalAmount)}</Text>
                    </Stack>
                    <Stack space={1}>
                      <Text muted size={1}>
                        Service
                      </Text>
                      <Text>
                        {order.selectedService?.service ||
                          order.shippingCarrier ||
                          '—'}
                      </Text>
                    </Stack>
                  </Grid>
                </Stack>
              </Card>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
