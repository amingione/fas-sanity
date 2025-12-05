import {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {Box, Card, Flex, Heading, Select, Spinner, Stack, Text, useToast} from '@sanity/ui'
import {DEFAULT_VENDOR_DISCOUNTS} from '../../../../../shared/vendorPricing'

const API_VERSION = '2024-10-01'
const WORKFLOW_OPTIONS = [
  {value: 'all', label: 'All workflows'},
  {value: 'pending', label: 'Pending review'},
  {value: 'approved', label: 'Approved - awaiting payment'},
  {value: 'paid', label: 'Paid - ready to fulfill'},
  {value: 'partial', label: 'Partially fulfilled'},
  {value: 'fulfilled', label: 'Fulfilled'},
  {value: 'cancelled', label: 'Cancelled'},
]

type WholesaleOrder = {
  _id: string
  orderNumber?: string
  status?: string
  totalAmount?: number
  currency?: string
  wholesaleWorkflowStatus?: string
  wholesaleDetails?: {
    bulkQuantity?: number
    pricingTier?: string
    expectedShipDate?: string
    vendor?: {companyName?: string; pricingTier?: string; customDiscountPercentage?: number}
  }
  cart?: Array<{quantity?: number | null} | null>
}

const WholesaleOrdersPane = forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [orders, setOrders] = useState<WholesaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [workflowFilter, setWorkflowFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const docs = await client.fetch<WholesaleOrder[]>(
        `*[_type == "order" && orderType == "wholesale"] | order(dateTime(coalesce(createdAt, _createdAt)) desc)[0...120]{
          _id,
          orderNumber,
          status,
          totalAmount,
          currency,
          wholesaleWorkflowStatus,
          wholesaleDetails{
            bulkQuantity,
            pricingTier,
            expectedShipDate,
            vendor->{companyName, pricingTier, customDiscountPercentage}
          },
          cart[]{quantity}
        }`,
      )
      setOrders(docs ?? [])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (workflowFilter === 'all') return true
      return (
        order.wholesaleWorkflowStatus === workflowFilter ||
        order.wholesaleDetails?.workflowStatus === workflowFilter
      )
    })
  }, [orders, workflowFilter])

  const updateWorkflow = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      await client
        .patch(id)
        .set({
          wholesaleWorkflowStatus: status,
          'wholesaleDetails.workflowStatus': status,
        })
        .commit()
      toast.push({status: 'success', title: 'Workflow updated'})
      await loadOrders()
    } catch (error) {
      console.error('wholesale workflow update failed', error)
      toast.push({status: 'error', title: 'Unable to update workflow'})
    } finally {
      setUpdatingId(null)
    }
  }

  const formatCurrency = (value?: number, currency = 'USD') => {
    if (typeof value !== 'number') return '—'
    return new Intl.NumberFormat('en-US', {style: 'currency', currency}).format(value)
  }

  const resolveQuantity = (order: WholesaleOrder) => {
    if (order.wholesaleDetails?.bulkQuantity) return order.wholesaleDetails.bulkQuantity
    const total = order.cart?.reduce((sum, item) => sum + (item?.quantity ?? 0), 0) ?? 0
    return total || 0
  }

  const resolveDiscount = (order: WholesaleOrder) => {
    const tier = order.wholesaleDetails?.pricingTier || order.wholesaleDetails?.vendor?.pricingTier
    if (tier === 'custom' && typeof order.wholesaleDetails?.vendor?.customDiscountPercentage === 'number') {
      return order.wholesaleDetails.vendor.customDiscountPercentage
    }
    if (tier && tier in DEFAULT_VENDOR_DISCOUNTS) {
      return DEFAULT_VENDOR_DISCOUNTS[tier as keyof typeof DEFAULT_VENDOR_DISCOUNTS]
    }
    return 0
  }

  if (loading) {
    return (
      <Flex ref={ref} align="center" justify="center" height="fill">
        <Spinner muted />
      </Flex>
    )
  }

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Heading as="h2" size={3}>
            Wholesale Orders
          </Heading>
          <Select value={workflowFilter} onChange={(event) => setWorkflowFilter(event.currentTarget.value)}>
            {WORKFLOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Flex>
        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Flex paddingY={2} paddingX={3} style={{fontWeight: 600}}>
              <Text style={{flex: 1}}>Order</Text>
              <Text style={{flex: 1}}>Vendor</Text>
              <Text style={{flex: 1}}>Pricing Tier</Text>
              <Text style={{flex: 1}}>Quantity</Text>
              <Text style={{flex: 1}}>Workflow Status</Text>
              <Text style={{flex: 1}}>Total</Text>
            </Flex>
            <Stack space={2}>
              {filtered.length === 0 ? (
                <Card padding={3} radius={2} tone="transparent">
                  <Text muted>No wholesale orders match this view.</Text>
                </Card>
              ) : (
                filtered.map((order) => (
                  <Card key={order._id} padding={3} radius={2} tone="transparent" border>
                    <Flex align="center" gap={3}>
                      <Stack flex={1} space={1}>
                        <Text weight="medium">{order.orderNumber}</Text>
                        <Text size={1} muted>
                          Status: {order.status}
                        </Text>
                      </Stack>
                      <Stack flex={1} space={1}>
                        <Text weight="medium">
                          {order.wholesaleDetails?.vendor?.companyName || 'Unassigned vendor'}
                        </Text>
                        <Text size={1} muted>
                          Discount {resolveDiscount(order)}%
                        </Text>
                      </Stack>
                      <Stack flex={1} space={1}>
                        <Text>{order.wholesaleDetails?.pricingTier || 'Standard'}</Text>
                        {order.wholesaleDetails?.expectedShipDate && (
                          <Text size={1} muted>
                            Ship {order.wholesaleDetails.expectedShipDate}
                          </Text>
                        )}
                      </Stack>
                      <Text style={{flex: 1}}>{resolveQuantity(order)}</Text>
                      <Stack flex={1} space={1}>
                        <Select
                          value={order.wholesaleWorkflowStatus || order.wholesaleDetails?.workflowStatus || 'pending'}
                          disabled={updatingId === order._id}
                          onChange={(event) => updateWorkflow(order._id, event.currentTarget.value)}
                        >
                          {WORKFLOW_OPTIONS.filter((opt) => opt.value !== 'all').map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Stack>
                      <Text style={{flex: 1}} weight="medium">
                        {formatCurrency(order.totalAmount, order.currency)}
                      </Text>
                    </Flex>
                  </Card>
                ))
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
})

WholesaleOrdersPane.displayName = 'WholesaleOrdersPane'

export default WholesaleOrdersPane
