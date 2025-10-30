import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {RefreshIcon, SearchIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {usePaneRouter} from 'sanity/desk'
import {
  CheckoutListItem,
  OrdersFacetCounts,
  OrdersListResult,
  listAbandonedCheckouts,
  listAll,
  listByFilters,
} from '../../groq/orders'

const formatCurrency = (currency: string | null | undefined, value?: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  const code = currency && currency.trim().length > 0 ? currency : 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const formatTimeAgo = (value?: string | null): string => {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'} ago`
  const years = Math.round(months / 12)
  return `${years} yr${years === 1 ? '' : 's'} ago`
}

type OrdersPaneOptions = {
  view?:
    | 'all'
    | 'unfulfilled'
    | 'unpaid'
    | 'open'
    | 'archived'
    | 'draftInvoices'
    | 'draftQuotes'
    | 'abandoned'
}

type OrdersPaneProps = {
  options?: OrdersPaneOptions
}

export type OrdersPaneView = NonNullable<OrdersPaneOptions['view']>

const VIEW_LABELS: Record<NonNullable<OrdersPaneOptions['view']>, string> = {
  all: 'All orders',
  unfulfilled: 'Unfulfilled orders',
  unpaid: 'Unpaid orders',
  open: 'Open orders',
  archived: 'Archived orders',
  draftInvoices: 'Invoice drafts',
  draftQuotes: 'Quote drafts',
  abandoned: 'Abandoned checkouts',
}

const useDebouncedValue = (value: string, delay = 250): string => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}

const getCustomerName = (item: OrdersListResult['items'][number]): string => {
  const fromRef = [item.customerRef?.firstName, item.customerRef?.lastName]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
  if (fromRef) return fromRef
  if (typeof item.customerName === 'string' && item.customerName.length > 0) return item.customerName
  return 'Guest'
}

const OrdersShopifyListPane = React.forwardRef<HTMLDivElement, OrdersPaneProps>(({options}, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = usePaneRouter()
  const view = options?.view || 'all'
  const [orders, setOrders] = useState<OrdersListResult['items']>([])
  const [counts, setCounts] = useState<OrdersFacetCounts | null>(null)
  const [checkouts, setCheckouts] = useState<CheckoutListItem[]>([])
  const [checkoutCount, setCheckoutCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const isCheckoutView = view === 'abandoned'
  const showSearch = !isCheckoutView

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (isCheckoutView) {
        const result = await listAbandonedCheckouts(client)
        setCheckouts(result.items || [])
        setCheckoutCount(result.counts?.total || 0)
        setCounts(null)
        setOrders([])
      } else {
        const baseSearch = debouncedSearch.trim()
        const params = baseSearch ? {search: baseSearch} : {}
        let result: OrdersListResult
        switch (view) {
          case 'unfulfilled':
            result = await listByFilters(client, {
              ...params,
              fulfillmentStatus: ['unfulfilled'],
              archived: false,
            })
            break
          case 'unpaid':
            result = await listByFilters(client, {
              ...params,
              paymentStatus: ['unpaid', 'pending', 'authorized'],
              archived: false,
            })
            break
          case 'open':
            result = await listByFilters(client, {
              ...params,
              status: ['open'],
              archived: false,
            })
            break
          case 'archived':
            result = await listByFilters(client, {
              ...params,
              archived: true,
            })
            break
          case 'draftInvoices':
            result = await listByFilters(client, {
              ...params,
              status: ['draft'],
              isInvoice: true,
              isQuote: false,
            })
            break
          case 'draftQuotes':
            result = await listByFilters(client, {
              ...params,
              status: ['draft'],
              isQuote: true,
            })
            break
          case 'all':
            result = baseSearch ? await listByFilters(client, params) : await listAll(client)
            break
          default:
            result = await listAll(client)
            break
        }
        setOrders(result.items || [])
        setCounts(result.counts)
        setCheckouts([])
        setCheckoutCount(0)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load orders.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [client, debouncedSearch, isCheckoutView, view])

  useEffect(() => {
    refresh()
  }, [refresh])

  const subtitle = useMemo(() => VIEW_LABELS[view] || 'Orders', [view])

  const renderOrderRow = useCallback(
    (order: OrdersListResult['items'][number]) => {
      const itemCount = typeof order.lineItemCount === 'number' ? order.lineItemCount : 0
      const customerName = getCustomerName(order)
      const createdAgo = formatTimeAgo(order.createdAt)
      const shippingMethod = order.shippingSelection?.service?.trim() || 'Standard'
      const amount = typeof order.total === 'number' ? order.total : order.shippingAmount
      const amountLabel = formatCurrency(order.currency, amount)
      let orderNumberLabel = '#—'
      if (typeof order.orderNumber === 'number') {
        orderNumberLabel = `#${order.orderNumber}`
      } else if (typeof order.orderNumber === 'string') {
        orderNumberLabel = `#${order.orderNumber}`
      }
      const tags = Array.isArray(order.tags) ? order.tags : []
      const systemTags = Array.isArray(order.systemTags)
        ? order.systemTags.filter((tag): tag is string => typeof tag === 'string')
        : []
      const isArchived = Boolean(order.archivedAt)
      const isCanceled = order.status === 'canceled'

      return (
        <Card
          key={order._id}
          padding={4}
          radius={3}
          shadow={1}
          tone="transparent"
          style={{cursor: 'pointer'}}
          onClick={() => router?.navigateIntent?.('edit', {id: order._id, type: 'order'})}
        >
          <Flex align="flex-start" justify="space-between" gap={4} wrap="wrap">
            <Box flex={1} minWidth={240}>
              <Stack space={2}>
                <Flex align="center" gap={3} wrap="wrap">
                  <Text size={3} weight="semibold">
                    {orderNumberLabel}
                  </Text>
                  {isArchived && (
                    <Badge tone="default" mode="outline">
                      Archived
                    </Badge>
                  )}
                  {isCanceled && (
                    <Badge tone="critical" mode="outline">
                      Canceled
                    </Badge>
                  )}
                </Flex>
                <Text size={2}>{customerName}</Text>
                <Text size={1} muted>
                  {`• ${itemCount} item${itemCount === 1 ? '' : 's'} • ${createdAgo}`}
                </Text>
                <Text size={1} muted>
                  {shippingMethod}
                </Text>
                <Flex gap={2} wrap="wrap">
                  {tags.map((tag) => (
                    <Badge
                      key={tag._id}
                      tone="primary"
                      style={
                        tag.color
                          ? {
                              backgroundColor: tag.color,
                              color: '#fff',
                            }
                          : undefined
                      }
                    >
                      {tag.name || 'Tag'}
                    </Badge>
                  ))}
                  {systemTags.map((tag) => (
                    <Badge key={tag} tone="default" mode="outline">
                      {tag}
                    </Badge>
                  ))}
                </Flex>
              </Stack>
            </Box>
            <Box>
              <Text size={3} weight="semibold">
                {amountLabel}
              </Text>
            </Box>
          </Flex>
        </Card>
      )
    },
    [router],
  )

  const renderCheckoutRow = useCallback(
    (checkout: CheckoutListItem) => {
      const title = checkout.customerName || checkout.customerEmail || 'Checkout'
      const createdAgo = formatTimeAgo(checkout.createdAt)
      const itemCount = typeof checkout.lineItemCount === 'number' ? checkout.lineItemCount : 0
      const amountLabel = formatCurrency(checkout.currency, checkout.total)
      return (
        <Card
          key={checkout._id}
          padding={4}
          radius={3}
          shadow={1}
          tone="transparent"
          style={{cursor: 'pointer'}}
          onClick={() => router?.navigateIntent?.('edit', {id: checkout._id, type: checkout._type})}
        >
          <Flex align="flex-start" justify="space-between" gap={4} wrap="wrap">
            <Stack space={2}>
              <Text size={3} weight="semibold">
                {title}
              </Text>
              <Text size={2} muted>
                {checkout.status || 'abandoned'}
              </Text>
              <Text size={1} muted>
                {`${itemCount} item${itemCount === 1 ? '' : 's'} • ${createdAgo}`}
              </Text>
            </Stack>
            <Text size={3} weight="semibold">
              {amountLabel}
            </Text>
          </Flex>
        </Card>
      )
    },
    [router],
  )

  return (
    <Box ref={ref} padding={[4, 5, 5]}>
      <Stack space={4}>
        <Flex align={['stretch', 'center']} gap={4} wrap="wrap" justify="space-between">
          <Stack space={2}>
            <Text size={4} weight="semibold">
              {subtitle}
            </Text>
            {counts && (
              <Flex gap={2} wrap="wrap">
                <Badge tone="primary">All {counts.all}</Badge>
                <Badge tone="default">Current {counts.current}</Badge>
                <Badge tone="default">Unfulfilled {counts.unfulfilled}</Badge>
                <Badge tone="default">Unpaid {counts.unpaid}</Badge>
                <Badge tone="default">Open {counts.open}</Badge>
                <Badge tone="default">Archived {counts.archived}</Badge>
              </Flex>
            )}
            {isCheckoutView && (
              <Badge tone="primary">Total {checkoutCount}</Badge>
            )}
          </Stack>
          <Flex gap={3} align="center">
            {showSearch && (
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search orders"
                icon={SearchIcon}
              />
            )}
            <Button
              icon={RefreshIcon}
              mode="ghost"
              text="Refresh"
              onClick={() => refresh()}
              disabled={loading}
            />
          </Flex>
        </Flex>

        {loading ? (
          <Flex align="center" justify="center" padding={6}>
            <Spinner size={4} muted />
          </Flex>
        ) : error ? (
          <Card padding={4} radius={3} tone="critical" shadow={1}>
            <Text>{error}</Text>
          </Card>
        ) : (
          <Stack space={3}>
            {!isCheckoutView && orders.map(renderOrderRow)}
            {isCheckoutView && checkouts.map(renderCheckoutRow)}
            {!loading && !error && !isCheckoutView && orders.length === 0 && (
              <Card padding={4} radius={3} tone="transparent">
                <Text muted>No orders match the current filters.</Text>
              </Card>
            )}
            {!loading && !error && isCheckoutView && checkouts.length === 0 && (
              <Card padding={4} radius={3} tone="transparent">
                <Text muted>No abandoned checkouts right now.</Text>
              </Card>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  )
})

OrdersShopifyListPane.displayName = 'OrdersShopifyListPane'

export default OrdersShopifyListPane
