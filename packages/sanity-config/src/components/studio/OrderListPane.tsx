import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@sanity/ui'
import {SortIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

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

const ORDER_MEDIA_URL =
  'https://cdn.sanity.io/images/r4og35qd/production/c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000.png'

const ORDER_PROJECTION = `{
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
}`

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

const PERSPECTIVE_STACK = [
  {id: 'recent', title: 'Recent', filter: '', defaultSortId: 'createdDesc'},
  {
    id: 'awaiting',
    title: 'Awaiting fulfillment',
    filter: '(status == "paid" && !defined(fulfilledAt))',
    defaultSortId: 'createdDesc',
  },
  {id: 'paid', title: 'Paid', filter: 'status == "paid"', defaultSortId: 'createdDesc'},
  {
    id: 'fulfilled',
    title: 'Fulfilled / Shipped',
    filter: 'status in ["fulfilled","shipped"]',
    defaultSortId: 'createdDesc',
  },
  {
    id: 'issues',
    title: 'Payment issues',
    filter: 'paymentStatus in ["cancelled","failed","refunded"]',
    defaultSortId: 'createdDesc',
  },
]

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

const getFnBase = (): string => {
  const envBase =
    typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  if (envBase) return envBase.trim()
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export default function OrderListPane() {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const toast = useToast()
  const fnBase = useMemo(() => getFnBase(), [])

  const [activePerspectiveId, setActivePerspectiveId] = useState(PERSPECTIVE_STACK[0].id)
  const [sortId, setSortId] = useState<string>(DEFAULT_SORT.id)
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState<null | 'packing' | 'fulfill'>(null)

  const activePerspective = useMemo(
    () => PERSPECTIVE_STACK.find((p) => p.id === activePerspectiveId) || PERSPECTIVE_STACK[0],
    [activePerspectiveId],
  )
  const sortOption = useMemo(
    () => SORT_OPTIONS.find((opt) => opt.id === sortId) || DEFAULT_SORT,
    [sortId],
  )

  useEffect(() => {
    if (
      activePerspective?.defaultSortId &&
      activePerspective.defaultSortId !== sortId &&
      SORT_OPTIONS.some((opt) => opt.id === activePerspective.defaultSortId)
    ) {
      setSortId(activePerspective.defaultSortId)
    }
  }, [activePerspective, sortId])

  const query = useMemo(() => {
    const filterClause = activePerspective?.filter ? ` && (${activePerspective.filter})` : ''
    return `*[_type == "order"${filterClause}] | order(${sortOption.orderBy}) [0...200] ${ORDER_PROJECTION}`
  }, [activePerspective, sortOption])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await client.fetch<OrderListItem[]>(query)
      setOrders(result || [])
      setSelectedIds(new Set())
    } catch (err: any) {
      setError(err?.message || 'Unable to load orders')
    } finally {
      setLoading(false)
    }
  }, [client, query])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const openOrder = useCallback(
    (orderId: string) => {
      router?.navigateIntent?.('edit', {id: orderId, type: 'order'})
    },
    [router],
  )

  const toggleSelected = useCallback((orderId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(orderId)
      else next.delete(orderId)
      return next
    })
  }, [])

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedIds(new Set())
        return
      }
      setSelectedIds(new Set(orders.map((order) => order._id)))
    },
    [orders],
  )

  const selectionCount = selectedIds.size
  const selectionArray = useMemo(() => Array.from(selectedIds), [selectedIds])
  const isIndeterminate = selectionCount > 0 && selectionCount < orders.length

  const handleBulkPackingSlips = useCallback(async () => {
    if (!selectionCount || !fnBase) return
    setBulkLoading('packing')
    try {
      for (const id of selectionArray) {
        const sanitizedId = id.replace(/^drafts\./, '')
        const response = await fetch(`${fnBase.replace(/\/$/, '')}/.netlify/functions/generatePackingSlips`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({orderId: sanitizedId}),
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }
      }
      toast.push({status: 'success', title: 'Packing slips queued'})
    } catch (err: any) {
      toast.push({
        status: 'error',
        title: 'Packing slips failed',
        description: err?.message || 'Request failed',
      })
    } finally {
      setBulkLoading(null)
      setSelectedIds(new Set())
      fetchOrders()
    }
  }, [selectionArray, selectionCount, fnBase, toast, fetchOrders])

  const handleBulkFulfill = useCallback(async () => {
    if (!selectionCount) return
    setBulkLoading('fulfill')
    try {
      await Promise.all(
        selectionArray.map((id) =>
          client
            .patch(id)
            .set({status: 'fulfilled', fulfilledAt: new Date().toISOString()})
            .commit({autoGenerateArrayKeys: true}),
        ),
      )
      toast.push({status: 'success', title: 'Orders marked fulfilled'})
    } catch (err: any) {
      toast.push({
        status: 'error',
        title: 'Failed to mark fulfilled',
        description: err?.message || 'Request failed',
      })
    } finally {
      setBulkLoading(null)
      setSelectedIds(new Set())
      fetchOrders()
    }
  }, [selectionArray, selectionCount, client, toast, fetchOrders])

  return (
    <Stack space={3} padding={3}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={2}>
        <Text weight="semibold">Orders</Text>
        <Flex gap={2} wrap="wrap">
          {PERSPECTIVE_STACK.map((perspective) => (
            <Button
              key={perspective.id}
              text={perspective.title}
              size={1}
              mode={perspective.id === activePerspectiveId ? 'default' : 'ghost'}
              tone={perspective.id === activePerspectiveId ? 'primary' : 'default'}
              onClick={() => setActivePerspectiveId(perspective.id)}
            />
          ))}
        </Flex>
      </Flex>

      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Flex align="center" gap={2}>
          <Checkbox
            checked={selectionCount > 0 && selectionCount === orders.length}
            indeterminate={isIndeterminate}
            onChange={(event) => toggleAll(event.currentTarget.checked)}
          />
          <Text size={1}>
            {selectionCount ? `${selectionCount} selected` : 'Select orders for bulk actions'}
          </Text>
        </Flex>
        <Flex gap={2} wrap="wrap">
          <Button
            text="Print packing slips"
            tone="primary"
            disabled={selectionCount === 0 || bulkLoading === 'packing'}
            loading={bulkLoading === 'packing'}
            onClick={handleBulkPackingSlips}
          />
          <Button
            text="Mark fulfilled"
            tone="primary"
            mode="ghost"
            disabled={selectionCount === 0 || bulkLoading === 'fulfill'}
            loading={bulkLoading === 'fulfill'}
            onClick={handleBulkFulfill}
          />
          <MenuButton
            id="orders-sort-menu"
            button={<Button icon={SortIcon} mode="bleed" tone="default" title="Sort" />}
            menu={
              <Menu>
                <Box paddingX={3} paddingTop={2}>
                  <Text size={1} muted>
                    Sort by
                  </Text>
                </Box>
                {SORT_OPTIONS.map((option) => (
                  <MenuItem
                    key={option.id}
                    text={option.title}
                    tone={option.id === sortId ? 'primary' : 'default'}
                    onClick={() => setSortId(option.id)}
                  />
                ))}
                <MenuDivider />
                <MenuItem text="Refresh" onClick={fetchOrders} />
              </Menu>
            }
          />
        </Flex>
      </Flex>

      {loading ? (
        <Flex align="center" justify="center" paddingY={5}>
          <Spinner />
        </Flex>
      ) : error ? (
        <Card padding={4} tone="critical" radius={3} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold">Failed to load orders</Text>
            <Text size={1}>{error}</Text>
            <Button text="Retry" tone="primary" onClick={fetchOrders} />
          </Stack>
        </Card>
      ) : orders.length === 0 ? (
        <Card padding={4} radius={3} tone="default" border>
          <Stack space={3}>
            <Text weight="semibold">No orders</Text>
            <Text muted size={1}>Try a different perspective or confirm Stripe webhooks are syncing.</Text>
          </Stack>
        </Card>
      ) : (
        <Stack space={2}>
          {orders.map((order) => {
            const createdLabel = formatDate(order.createdAt || order._updatedAt)
            const statusMeta = STATUS_META[order.status || ''] || {
              label: order.status || 'Unknown',
              tone: 'default' as const,
            }
            const checked = selectedIds.has(order._id)
            return (
              <Card key={order._id} radius={2} padding={2} tone="default" shadow={1}>
                <Flex align="center" gap={3}>
                  <Checkbox
                    checked={checked}
                    onChange={(event) => toggleSelected(order._id, event.currentTarget.checked)}
                  />
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={ORDER_MEDIA_URL}
                      alt="Order"
                      style={{width: '100%', height: '100%', objectFit: 'cover'}}
                    />
                  </span>
                  <Box
                    flex={1}
                    style={{cursor: 'pointer'}}
                    onClick={() => openOrder(order._id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') openOrder(order._id)
                    }}
                  >
                    <Stack space={2}>
                      <Text weight="semibold">
                        {order.orderNumber ? `${order.orderNumber}` : order._id.replace(/^drafts\./, '')} —{' '}
                        {order.customerName || order.customerEmail || 'Customer'}
                      </Text>
                      <Text muted size={1}>
                        {createdLabel} • {formatCurrency(order.totalAmount)}
                      </Text>
                    </Stack>
                  </Box>
                  <Badge tone={statusMeta.tone} mode="outline" fontSize={0} style={{textTransform: 'uppercase'}}>
                    {statusMeta.label}
                  </Badge>
                </Flex>
              </Card>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
