import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {useClient} from 'sanity'
import {Badge, Button, Card, Checkbox, Stack, Text, useToast} from '@sanity/ui'

const fmt = (n?: number) => (typeof n === 'number' ? n.toFixed(2) : '0.00')

const FULFILL_ENDPOINT = '/.netlify/functions/fulfill-order'
const ORDER_QUERY =
  '*[_type == "order" && status != "fulfilled"]{_id, orderNumber, customerEmail, totalAmount, status}'

interface Order {
  _id: string
  orderNumber?: string
  customerEmail: string
  totalAmount?: number
  status: string
}

const BulkFulfillmentConsole = forwardRef<HTMLDivElement, Record<string, never>>(
  function BulkFulfillmentConsole(_props, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null)

    const client = useClient({apiVersion: '2023-10-01'})
    const toast = useToast()
    const [orders, setOrders] = useState<Order[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [ordersLoading, setOrdersLoading] = useState<boolean>(true)
    const [ordersError, setOrdersError] = useState<string | null>(null)

    const fetchOrders = useCallback(async () => {
      setOrdersLoading(true)
      setOrdersError(null)
      try {
        const data: Order[] = await client.fetch(ORDER_QUERY)
        setOrders(data || [])
        // prune selection when orders change
        setSelected(
          (prev) =>
            new Set(Array.from(prev).filter((id) => (data || []).some((o) => o._id === id))),
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load orders'
        setOrdersError(msg)
      } finally {
        setOrdersLoading(false)
      }
    }, [client])

    useEffect(() => {
      let sub: {unsubscribe: () => void} | null = null
      let mounted = true

      // initial load
      fetchOrders()

      // real-time updates
      sub = client.listen(ORDER_QUERY, {}, {visibility: 'query'}).subscribe(() => {
        if (mounted) fetchOrders()
      })

      return () => {
        mounted = false
        if (sub) sub.unsubscribe()
      }
    }, [client, fetchOrders])

    const toggleSelection = (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    }

    const fulfillSelected = async () => {
      if (!selected.size) return
      setLoading(true)

      const ids = Array.from(selected)
      try {
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const res = await fetch(FULFILL_ENDPOINT, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({orderId: id}),
            })
            const json = await res.json().catch(() => ({}) as any)
            if (!res.ok || json?.success === false) {
              throw new Error(json?.error || `Failed to fulfill ${id}`)
            }
            return json
          }),
        )

        const rejected = results.filter((r) => r.status === 'rejected')
        const succeeded = results.length - rejected.length

        if (succeeded) {
          toast.push({
            status: 'success',
            title: 'Orders fulfilled',
            description: `${succeeded} order(s) processed successfully`,
          })
        }
        if (rejected.length) {
          toast.push({
            status: 'warning',
            title: 'Some orders failed',
            description: `${rejected.length} order(s) failed. Check logs.`,
          })
        }

        setSelected(new Set())
        await fetchOrders()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.push({status: 'error', title: 'Fulfillment error', description: msg})
      } finally {
        setLoading(false)
      }
    }

    const cancelSelected = async () => {
      if (!selected.size) return
      setLoading(true)
      const ids = Array.from(selected)
      const timestamp = new Date().toISOString()
      const logEntry = {
        _type: 'shippingLogEntry' as const,
        status: 'cancelled_bulk',
        message: 'Order cancelled via Bulk Fulfillment Console',
        createdAt: timestamp,
      }
      try {
        let tx = client.transaction()
        ids.forEach((id) => {
          tx = tx.patch(id, (patch) =>
            patch
              .set({
                status: 'cancelled',
                paymentStatus: 'cancelled',
                fulfilledAt: null,
              })
              .setIfMissing({shippingLog: []})
              .append('shippingLog', [logEntry]),
          )
        })
        await tx.commit({autoGenerateArrayKeys: true})

        toast.push({
          status: 'warning',
          title: 'Orders cancelled',
          description: `${ids.length} order(s) were cancelled and moved to the archive.`,
        })

        setSelected(new Set())
        await fetchOrders()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.push({status: 'error', title: 'Cancel error', description: msg})
      } finally {
        setLoading(false)
      }
    }

    useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, [])

    return (
      <Card padding={4} ref={rootRef}>
        <Stack space={4}>
          <Text size={2} weight="bold">
            Bulk Fulfillment Console
          </Text>

          <Card padding={3} radius={1} tone="transparent">
            <Button
              mode="default"
              onClick={() => {
                setSelected((prev) => {
                  if (prev.size === orders.length) return new Set()
                  return new Set(orders.map((o) => o._id))
                })
              }}
              disabled={orders.length === 0}
            >
              {selected.size === orders.length ? 'Unselect All' : 'Select All'}
            </Button>
          </Card>

          {ordersLoading && <Text muted>Loading orders…</Text>}
          {ordersError && !ordersLoading && (
            <Card padding={2} radius={2} tone="critical">
              <Text size={1}>{ordersError}</Text>
            </Card>
          )}
          {!ordersLoading && !ordersError && orders.length === 0 && (
            <Text muted>No open orders.</Text>
          )}

          {orders.map((order) => (
            <Card key={order._id} padding={3} shadow={1} radius={2} tone="default">
              <Stack space={3}>
                <label style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <Checkbox
                    checked={selected.has(order._id)}
                    onChange={() => toggleSelection(order._id)}
                  />
                  <Text size={1} muted>
                    {order.orderNumber || order._id}
                  </Text>
                </label>
                <Text>{order.customerEmail}</Text>
                <Text muted>${fmt(order.totalAmount)}</Text>
                <Badge
                  mode="outline"
                  tone={
                    order.status === 'cancelled'
                      ? 'critical'
                      : order.status === 'fulfilled'
                        ? 'positive'
                        : 'caution'
                  }
                >
                  {order.status}
                </Badge>
              </Stack>
            </Card>
          ))}
          <Button
            tone="positive"
            loading={loading}
            disabled={selected.size === 0 || loading}
            onClick={fulfillSelected}
          >
            {`Fulfill ${selected.size} Selected Order(s)`}
          </Button>
          <Button
            tone="critical"
            disabled={selected.size === 0 || loading}
            loading={loading}
            onClick={cancelSelected}
          >
            {`Cancel ${selected.size} Selected Order(s)`}
          </Button>
        </Stack>
      </Card>
    )
  },
)

export default BulkFulfillmentConsole
