import {Card, Stack, Box, Text, Flex, Badge, Button, Select} from '@sanity/ui'
import {useCallback, useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

interface Order {
  _id: string
  _createdAt: string
  _updatedAt: string
  orderNumber: string
  status: string
  customerName: string
  customerEmail: string
  orderType: string
  createdAt: string
}

interface OrdersByStatus {
  [key: string]: Order[]
}

const STATUS_ORDER = ['paid', 'fulfilled', 'expired', 'cancelled', 'refunded']
const DELAY_THRESHOLDS = {
  paid: 24, // hours - orders should be fulfilled within 24 hours of payment
  fulfilled: 48, // hours - fulfilled orders should ship within 48 hours
}

const STATUS_TRANSITIONS: {[key: string]: string[]} = {
  paid: ['fulfilled', 'cancelled', 'refunded'],
  fulfilled: ['cancelled', 'refunded'],
}

type BadgeTone = 'default' | 'primary' | 'positive' | 'caution' | 'critical'

export function OrderFulfillmentWidget() {
  const client = useClient({apiVersion: '2024-01-01'})
  const router = useRouter()
  const [orders, setOrders] = useState<OrdersByStatus>({})
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchOrders = useCallback(() => {
    const typeFilter = filterType !== 'all' ? `&& orderType == "${filterType}"` : ''

    // Show paid and fulfilled orders (orders that need action)
    const query = `*[_type == "order" && status in ["paid", "fulfilled"] ${typeFilter}] {
      _id,
      _createdAt,
      _updatedAt,
      orderNumber,
      status,
      customerName,
      customerEmail,
      orderType,
      createdAt
    } | order(_createdAt desc)`

    client.fetch(query).then((result: Order[]) => {
      const grouped = result.reduce((acc: OrdersByStatus, order) => {
        const status = order.status || 'paid'
        if (!acc[status]) acc[status] = []
        acc[status].push(order)
        return acc
      }, {})
      setOrders(grouped)
      setLoading(false)
    })
  }, [client, filterType])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const getHoursInStatus = (order: Order) => {
    const updated = new Date(order._updatedAt).getTime()
    const now = Date.now()
    return Math.floor((now - updated) / (1000 * 60 * 60))
  }

  const isDelayed = (order: Order) => {
    const hours = getHoursInStatus(order)
    const threshold = DELAY_THRESHOLDS[order.status as keyof typeof DELAY_THRESHOLDS]
    return threshold && hours > threshold
  }

  const getStatusColor = (status: string): BadgeTone => {
    const colors: {[key: string]: BadgeTone} = {
      paid: 'caution',
      fulfilled: 'primary',
      expired: 'critical',
      cancelled: 'critical',
      refunded: 'critical',
    }
    return colors[status] || 'default'
  }

  const openOrder = (orderId: string) => {
    router.navigateIntent('edit', {id: orderId, type: 'order'})
  }

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId)
    try {
      await client.patch(orderId).set({status: newStatus}).commit()

      // Refresh orders after update
      fetchOrders()
    } catch (error) {
      console.error('Failed to update order:', error)
    } finally {
      setUpdating(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <Card padding={4}>
        <Text>Loading orders...</Text>
      </Card>
    )
  }

  const totalOrders = Object.values(orders).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <Card padding={3}>
      <Stack space={4}>
        {/* Header */}
        <Text size={2} weight="semibold">
          Order Fulfillment
        </Text>

        {/* Filter Controls */}
        <Flex gap={3} align="center">
          <Box flex={1}>
            <Select
              fontSize={1}
              value={filterType}
              onChange={(e) => setFilterType(e.currentTarget.value)}
            >
              <option value="all">All Order Types ({totalOrders})</option>
              <option value="online">Online Orders</option>
              <option value="wholesale">Wholesale Orders</option>
              <option value="in-store">In-Store Orders</option>
            </Select>
          </Box>
        </Flex>

        {/* Orders by Status */}
        {STATUS_ORDER.map((status) => {
          const statusOrders = orders[status] || []
          if (statusOrders.length === 0) return null

          const delayedCount = statusOrders.filter(isDelayed).length

          return (
            <Box key={status}>
              <Flex align="center" gap={2} marginBottom={2}>
                <Badge tone={getStatusColor(status)} fontSize={1}>
                  {status.toUpperCase()}
                </Badge>
                <Text size={1} weight="semibold">
                  {statusOrders.length} orders
                </Text>
                {delayedCount > 0 && (
                  <Badge tone="critical" fontSize={1}>
                    ⚠️ {delayedCount} delayed
                  </Badge>
                )}
              </Flex>

              <Stack space={2}>
                {statusOrders.slice(0, 5).map((order) => {
                  const hours = getHoursInStatus(order)
                  const delayed = isDelayed(order)
                  const transitions = STATUS_TRANSITIONS[order.status] || []

                  return (
                    <Card
                      key={order._id}
                      padding={3}
                      radius={2}
                      shadow={1}
                      tone={delayed ? 'critical' : 'default'}
                      style={{cursor: 'pointer'}}
                    >
                      <Stack space={3}>
                        {/* Order Header - Clickable */}
                        <Flex
                          justify="space-between"
                          align="center"
                          onClick={() => openOrder(order._id)}
                        >
                          <Box flex={1}>
                            <Stack space={2}>
                              <Text size={3} weight="semibold">
                                {order.orderNumber}
                              </Text>
                              <Text size={2} muted>
                                {order.customerName}
                              </Text>
                              {order.customerEmail && (
                                <Text size={2} muted style={{fontSize: '12px'}}>
                                  {order.customerEmail}
                                </Text>
                              )}
                            </Stack>
                          </Box>
                          <Box style={{textAlign: 'right'}}>
                            <Badge
                              tone={order.orderType === 'wholesale' ? 'primary' : 'default'}
                              fontSize={0}
                            >
                              {order.orderType || 'online'}
                            </Badge>
                            <Text size={1} muted style={{display: 'block', marginTop: '4px'}}>
                              {hours}h in {status}
                            </Text>
                            <Text size={0} muted>
                              {formatDate(order.createdAt || order._createdAt)}
                            </Text>
                          </Box>
                        </Flex>

                        {/* Status Transition Buttons */}
                        {transitions.length > 0 && (
                          <Flex gap={2}>
                            {transitions.map((nextStatus) => (
                              <Button
                                key={nextStatus}
                                fontSize={1}
                                padding={2}
                                tone={getStatusColor(nextStatus)}
                                mode="ghost"
                                text={`Mark as ${nextStatus}`}
                                disabled={updating === order._id}
                                loading={updating === order._id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  updateOrderStatus(order._id, nextStatus)
                                }}
                              />
                            ))}
                          </Flex>
                        )}
                      </Stack>
                    </Card>
                  )
                })}
                {statusOrders.length > 5 && (
                  <Text size={1} muted>
                    + {statusOrders.length - 5} more orders
                  </Text>
                )}
              </Stack>
            </Box>
          )
        })}

        {totalOrders === 0 && (
          <Card padding={4} tone="transparent">
            <Text align="center" muted>
              No orders needing fulfillment
            </Text>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
