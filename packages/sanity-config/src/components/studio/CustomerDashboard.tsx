import {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {Badge, Button, Card, Flex, Grid, Spinner, Stack, Text} from '@sanity/ui'
import {format, formatDistanceToNow, parseISO} from 'date-fns'

type CustomerDoc = {
  _id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}

type OrderSummary = {
  _id: string
  orderNumber?: string | null
  _createdAt?: string | null
  totalAmount?: number | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  status?: string | null
  orderType?: string | null
}

type VehicleSummary = {
  _id: string
  year?: number | null
  make?: string | null
  model?: string | null
  vin?: string | null
  serviceCount?: number | null
  lastService?: string | null
}

type AppointmentSummary = {
  _id: string
  appointmentNumber?: string | null
  scheduledDate?: string | null
  service?: {title?: string | null} | null
  status?: string | null
}

type MetricsResult = {
  lifetimeValue: number
  totalOrders: number
  avgOrderValue: number
  lastOrderDate?: string | null
  firstOrderDate?: string | null
  daysSinceLastOrder?: number | null
  segment?: string | null
}

type CustomerDashboardResponse = {
  metrics: MetricsResult
  orders: OrderSummary[]
  vehicles: VehicleSummary[]
  appointments: AppointmentSummary[]
}

const API_VERSION = '2024-10-01'
const ORDER_TOTAL_EXPR =
  'coalesce(totalAmount, amountSubtotal - coalesce(amountDiscount, 0) + amountTax + amountShipping, totalAmount, total, 0)'
const ORDER_TOTAL_PROJECTION = `{ "total": ${ORDER_TOTAL_EXPR} }.total`

const CUSTOMER_DASHBOARD_QUERY = `{
  "metrics": {
    "lifetimeValue": coalesce(math::sum(*[_type == "order" && customerRef._ref == $customerId && status == "paid"]${ORDER_TOTAL_PROJECTION}), 0),
    "totalOrders": count(*[_type == "order" && customerRef._ref == $customerId]),
    "avgOrderValue": coalesce(math::avg(*[_type == "order" && customerRef._ref == $customerId && status == "paid"]${ORDER_TOTAL_PROJECTION}), 0),
    "lastOrderDate": *[_type == "order" && customerRef._ref == $customerId] | order(dateTime(coalesce(orderDate, createdAt, _createdAt)) desc)[0]{
      "ts": coalesce(orderDate, createdAt, _createdAt)
    }.ts,
    "firstOrderDate": *[_type == "order" && customerRef._ref == $customerId] | order(dateTime(coalesce(orderDate, createdAt, _createdAt)) asc)[0]{
      "ts": coalesce(orderDate, createdAt, _createdAt)
    }.ts,
    "segment": *[_type == "customer" && _id == $customerId][0].segment,
    "daysSinceLastOrder": *[_type == "customer" && _id == $customerId][0].daysSinceLastOrder
  },
  "orders": *[_type == "order" && customerRef._ref == $customerId] | order(dateTime(coalesce(orderDate, createdAt, _createdAt)) desc)[0...10]{
    _id,
    orderNumber,
    _createdAt,
    totalAmount,
    amountSubtotal,
    amountTax,
    amountShipping,
    status,
    orderType
  },
  "vehicles": *[_type == "vehicle" && customer._ref == $customerId]{
    _id,
    year,
    make,
    model,
    vin,
    "serviceCount": count(*[_type == "workOrder" && vehicle._ref == ^._id]),
    "lastService": *[_type == "workOrder" && vehicle._ref == ^._id] | order(completedAt desc)[0].completedAt
  },
  "appointments": *[_type == "appointment" && customer._ref == $customerId] | order(scheduledDate desc)[0...5]{
    _id,
    appointmentNumber,
    scheduledDate,
    service->{title},
    status
  }
}`

const formatCurrency = (value?: number | null, currency = 'USD') => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatDate = (value?: string | null, fallback = '—') => {
  if (!value) return fallback
  const parsed = parseISO(value)
  if (!Number.isFinite(parsed.getTime())) return fallback
  return format(parsed, 'MMM d, yyyy')
}

const SEGMENT_BADGES: Record<string, string> = {
  vip: '💎 VIP',
  repeat: '🔁 Repeat',
  new: '🆕 New',
  at_risk: '⚠️ At Risk',
  inactive: '😴 Inactive',
  active: '✅ Active',
}

const buildOrderTotal = (order: OrderSummary): number => {
  const {totalAmount, amountSubtotal, amountTax, amountShipping} = order
  if (typeof totalAmount === 'number') return totalAmount
  const subtotal = typeof amountSubtotal === 'number' ? amountSubtotal : 0
  const tax = typeof amountTax === 'number' ? amountTax : 0
  const shipping = typeof amountShipping === 'number' ? amountShipping : 0
  return subtotal + tax + shipping
}

const CustomerDashboard = (props: any) => {
  const doc = (props?.document?.displayed || {}) as CustomerDoc
  const schemaType = props?.schemaType
  const router = useRouter()
  const client = useClient({apiVersion: API_VERSION})
  const [data, setData] = useState<CustomerDashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customerId =
    doc?._id?.replace(/^drafts\./, '') || props?.documentId?.replace(/^drafts\./, '')

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    client
      .fetch<CustomerDashboardResponse>(CUSTOMER_DASHBOARD_QUERY, {
        customerId,
      })
      .then((result) => {
        if (!cancelled) {
          setData(result)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Customer dashboard query failed', err)
          setError(err instanceof Error ? err.message : 'Unable to load customer data')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, customerId])

  const metrics = data?.metrics
  const segmentLabel = metrics?.segment ? SEGMENT_BADGES[metrics.segment] || metrics.segment : null
  const lifetimeValue = metrics ? formatCurrency(metrics.lifetimeValue) : '$0'
  const averageOrderValue = metrics ? formatCurrency(metrics.avgOrderValue) : '$0'
  const totalOrders = metrics?.totalOrders ?? 0

  const name = useMemo(() => {
    const parts = [doc?.firstName, doc?.lastName].filter(Boolean)
    return parts.length ? parts.join(' ') : doc?.email || 'Customer'
  }, [doc?.email, doc?.firstName, doc?.lastName])

  const handleCreateOrder = () => {
    if (!customerId) return
    router?.navigateIntent?.('create', {
      type: 'order',
      initialValue: JSON.stringify({
        customerRef: {_type: 'reference', _ref: customerId},
        customerEmail: doc?.email,
      }),
    })
  }

  const handleBookAppointment = () => {
    if (!customerId) return
    router?.navigateIntent?.('create', {
      type: 'appointment',
      initialValue: JSON.stringify({
        customer: {_type: 'reference', _ref: customerId},
      }),
    })
  }

  const handleSendEmail = () => {
    if (!doc?.email) return
    if (typeof window === 'undefined') return
    const subject = encodeURIComponent(`Hello from FAS Motorsports`)
    const body = encodeURIComponent(`Hi ${doc?.firstName || ''},\n\n`)
    window?.open(`mailto:${doc.email}?subject=${subject}&body=${body}`, '_blank')
  }

  if (schemaType?.name !== 'customer') {
    return (
      <Card padding={4}>
        <Text>This dashboard is only available for customer documents.</Text>
      </Card>
    )
  }

  if (!customerId) {
    return (
      <Card padding={4}>
        <Text>Save the customer document to view dashboard insights.</Text>
      </Card>
    )
  }

  return (
    <Stack space={4} padding={4}>
      {loading && (
        <Flex gap={3} align="center">
          <Spinner muted />
          <Text muted>Loading customer insights…</Text>
        </Flex>
      )}
      {error && (
        <Card tone="critical" padding={3} radius={2}>
          <Text size={1}>{error}</Text>
        </Card>
      )}
      <Card padding={4} radius={3} shadow={1}>
        <Stack space={4}>
          <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
            <Stack space={2}>
              <Text size={3} weight="semibold">
                Customer Overview
              </Text>
              <Text muted>
                {name}
                {doc?.email ? ` • ${doc.email}` : ''}
                {doc?.phone ? ` • ${doc.phone}` : ''}
              </Text>
            </Stack>
            <Flex gap={2} wrap="wrap">
              <Button text="Create order" tone="primary" onClick={handleCreateOrder} />
              <Button text="Book appointment" mode="ghost" onClick={handleBookAppointment} />
              <Button text="Send email" mode="ghost" onClick={handleSendEmail} />
            </Flex>
          </Flex>
          <Grid columns={[1, 2, 4]} gap={3}>
            <Card padding={3} radius={2} tone="transparent" border>
              <Text size={1} muted>
                Segment
              </Text>
              <Text size={3} weight="semibold">
                {segmentLabel || 'Not calculated'}
              </Text>
            </Card>
            <Card padding={3} radius={2} tone="transparent" border>
              <Text size={1} muted>
                Lifetime value
              </Text>
              <Text size={3} weight="semibold">
                {lifetimeValue}
              </Text>
            </Card>
            <Card padding={3} radius={2} tone="transparent" border>
              <Text size={1} muted>
                Total orders
              </Text>
              <Text size={3} weight="semibold">
                {totalOrders}
              </Text>
            </Card>
            <Card padding={3} radius={2} tone="transparent" border>
              <Text size={1} muted>
                Avg. order value
              </Text>
              <Text size={3} weight="semibold">
                {averageOrderValue}
              </Text>
            </Card>
          </Grid>
          <Grid columns={[1, 2]} gap={3}>
            <Card padding={3} radius={2} tone="transparent" border>
              <Text size={1} muted>
                First order
              </Text>
              <Text size={2}>{formatDate(metrics?.firstOrderDate, 'None yet')}</Text>
            </Card>
            <Card padding={3} radius={2} tone="transparent" border>
              <Text size={1} muted>
                Last order
              </Text>
              <Text size={2}>
                {metrics?.lastOrderDate
                  ? `${formatDate(metrics.lastOrderDate)} • ${formatDistanceToNow(parseISO(metrics.lastOrderDate), {addSuffix: true})}`
                  : 'None yet'}
              </Text>
            </Card>
          </Grid>
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Order History
          </Text>
          {data?.orders?.length ? (
            <Stack space={2}>
              {data.orders.map((order) => (
                <Card key={order._id} padding={3} radius={2} border>
                  <Flex
                    align={['flex-start', 'center']}
                    justify="space-between"
                    wrap="wrap"
                    gap={3}
                  >
                    <Stack space={1}>
                      <Text weight="semibold">
                        {order.orderNumber || order._id} • {formatDate(order._createdAt)}
                      </Text>
                      <Text size={1} muted>
                        {order.orderType ? order.orderType.replace(/_/g, ' ') : 'Online order'}
                      </Text>
                    </Stack>
                    <Stack space={1} style={{minWidth: 160, textAlign: 'right'}}>
                      <Text weight="semibold">{formatCurrency(buildOrderTotal(order))}</Text>
                      <Badge mode="outline">{order.status || 'draft'}</Badge>
                    </Stack>
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text size={1} muted>
              No orders yet.
            </Text>
          )}
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Vehicles
          </Text>
          {data?.vehicles?.length ? (
            <Grid columns={[1, 2]} gap={3}>
              {data.vehicles.map((vehicle) => (
                <Card key={vehicle._id} padding={3} radius={2} border>
                  <Stack space={2}>
                    <Text weight="semibold">
                      {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                        'Vehicle'}
                    </Text>
                    {vehicle.vin && (
                      <Text size={1} muted>
                        VIN: {vehicle.vin}
                      </Text>
                    )}
                    <Flex gap={4}>
                      <Stack space={1}>
                        <Text size={1} muted>
                          Service visits
                        </Text>
                        <Text>{vehicle.serviceCount ?? 0}</Text>
                      </Stack>
                      <Stack space={1}>
                        <Text size={1} muted>
                          Last service
                        </Text>
                        <Text>{vehicle.lastService ? formatDate(vehicle.lastService) : '—'}</Text>
                      </Stack>
                    </Flex>
                  </Stack>
                </Card>
              ))}
            </Grid>
          ) : (
            <Text size={1} muted>
              No vehicles on file.
            </Text>
          )}
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Appointments & Work Orders
          </Text>
          {data?.appointments?.length ? (
            <Stack space={2}>
              {data.appointments.map((appt) => (
                <Card key={appt._id} padding={3} radius={2} border>
                  <Flex
                    align={['flex-start', 'center']}
                    justify="space-between"
                    wrap="wrap"
                    gap={3}
                  >
                    <Stack space={1}>
                      <Text weight="semibold">{appt.appointmentNumber || 'Appointment'}</Text>
                      <Text size={1} muted>
                        {appt.service?.title || 'Service TBD'}
                      </Text>
                    </Stack>
                    <Stack space={1} style={{textAlign: 'right'}}>
                      <Text>
                        {appt.scheduledDate ? formatDate(appt.scheduledDate) : 'Unscheduled'}
                      </Text>
                      <Badge mode="outline">{appt.status || 'scheduled'}</Badge>
                    </Stack>
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text size={1} muted>
              No appointments scheduled.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}

export default CustomerDashboard
