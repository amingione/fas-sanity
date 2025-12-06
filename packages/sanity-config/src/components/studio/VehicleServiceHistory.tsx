import {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {Badge, Box, Card, Flex, Grid, Spinner, Stack, Text} from '@sanity/ui'
import {format} from 'date-fns'

type VehicleDoc = {
  _id: string
  nextServiceDue?: string | null
  serviceReminder?: boolean | null
}

type WorkOrderRecord = {
  _id: string
  workOrderNumber?: string | null
  status?: string | null
  startedAt?: string | null
  completedAt?: string | null
  laborHours?: number | null
  laborRate?: number | null
  additionalCharges?: Array<{amount?: number | null}> | null
  partsUsed?: Array<{quantity?: number | null; price?: number | null; part?: {title?: string | null}} | null> | null
  service?: {title?: string | null} | null
}

type AppointmentRecord = {
  _id: string
  appointmentNumber?: string | null
  scheduledDate?: string | null
  service?: {title?: string | null} | null
  status?: string | null
}

type VehicleHistoryResponse = {
  workOrders: WorkOrderRecord[]
  appointments: AppointmentRecord[]
}

const API_VERSION = '2024-10-01'
const VEHICLE_HISTORY_QUERY = `{
  "workOrders": *[_type == "workOrder" && vehicle._ref == $vehicleId] | order(coalesce(completedAt, startedAt, _createdAt) desc){
    _id,
    workOrderNumber,
    status,
    startedAt,
    completedAt,
    laborHours,
    laborRate,
    additionalCharges[]{amount},
    partsUsed[]{quantity, price, part->{title}},
    service->{title}
  },
  "appointments": *[_type == "appointment" && vehicle._ref == $vehicleId && status in ["scheduled","confirmed","needs_confirmation"]] | order(scheduledDate asc)[0...5]{
    _id,
    appointmentNumber,
    scheduledDate,
    service->{title},
    status
  }
}`

const calculateWorkOrderCost = (workOrder: WorkOrderRecord): number => {
  const laborHours = typeof workOrder.laborHours === 'number' ? workOrder.laborHours : 0
  const laborRate = typeof workOrder.laborRate === 'number' ? workOrder.laborRate : 0
  const laborTotal = laborHours * laborRate
  const additional =
    workOrder.additionalCharges?.reduce((sum, charge) => sum + (charge?.amount || 0), 0) || 0
  const partsTotal =
    workOrder.partsUsed?.reduce((sum, part) => {
      const quantity = typeof part?.quantity === 'number' ? part.quantity : 0
      const price = typeof part?.price === 'number' ? part.price : 0
      return sum + quantity * price
    }, 0) || 0
  return laborTotal + partsTotal + additional
}

const formatDate = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'TBD'
  return format(date, 'MMM d, yyyy')
}

const VehicleServiceHistory = (props: any) => {
  const doc = (props?.document?.displayed || {}) as VehicleDoc
  const schemaType = props?.schemaType
  const client = useClient({apiVersion: API_VERSION})
  const [data, setData] = useState<VehicleHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vehicleId = doc?._id?.replace(/^drafts\./, '') || props?.documentId?.replace(/^drafts\./, '')

  useEffect(() => {
    if (!vehicleId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    client
      .fetch<VehicleHistoryResponse>(VEHICLE_HISTORY_QUERY, {vehicleId})
      .then((result) => {
        if (!cancelled) {
          setData(result)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Vehicle history query failed', err)
          setError(err instanceof Error ? err.message : 'Unable to load service history')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, vehicleId])

  const workOrders = useMemo(() => data?.workOrders || [], [data?.workOrders])
  const totalServiceCost = useMemo(
    () => workOrders.reduce((sum, order) => sum + calculateWorkOrderCost(order), 0),
    [workOrders],
  )
  const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

  const commonServices = useMemo(() => {
    const counts = workOrders.reduce<Record<string, number>>((acc, order) => {
      const title = order.service?.title || 'Service'
      acc[title] = (acc[title] || 0) + 1
      return acc
    }, {})
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [workOrders])

  const partsSummary = useMemo(() => {
    const counts = workOrders.reduce<Record<string, number>>((acc, order) => {
      order.partsUsed?.forEach((part) => {
        const label = part?.part?.title || 'Part'
        acc[label] = (acc[label] || 0) + 1
      })
      return acc
    }, {})
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [workOrders])

  if (schemaType?.name !== 'vehicle') {
    return (
      <Card padding={4}>
        <Text>This view is only available for vehicle documents.</Text>
      </Card>
    )
  }

  if (!vehicleId) {
    return (
      <Card padding={4}>
        <Text>Save the vehicle record to view service history.</Text>
      </Card>
    )
  }

  return (
    <Stack space={4} padding={4}>
      {loading && (
        <Flex gap={3} align="center">
          <Spinner muted />
          <Text muted>Loading service history…</Text>
        </Flex>
      )}
      {error && (
        <Card padding={3} tone="critical" radius={2}>
          <Text size={1}>{error}</Text>
        </Card>
      )}

      <Card padding={4} radius={3} shadow={1}>
        <Grid columns={[1, 2, 3]} gap={3}>
          <Card padding={3} border radius={2} tone="transparent">
            <Text size={1} muted>
              Total service cost
            </Text>
            <Text size={3} weight="semibold">
              {currency.format(totalServiceCost)}
            </Text>
          </Card>
          <Card padding={3} border radius={2} tone="transparent">
            <Text size={1} muted>
              Work orders completed
            </Text>
            <Text size={3} weight="semibold">
              {workOrders.length}
            </Text>
          </Card>
          <Card padding={3} border radius={2} tone="transparent">
            <Text size={1} muted>
              Next service due
            </Text>
            <Text size={3} weight="semibold">
              {doc?.nextServiceDue ? formatDate(doc.nextServiceDue) : 'Not scheduled'}
            </Text>
          </Card>
        </Grid>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Work Orders
          </Text>
          {workOrders.length ? (
            <Stack space={2}>
              {workOrders.map((order) => (
                <Card key={order._id} padding={3} radius={2} border>
                  <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
                    <Stack space={1}>
                      <Text weight="semibold">{order.workOrderNumber || 'Work Order'}</Text>
                      <Text size={1} muted>{order.service?.title || 'Service'}</Text>
                      <Text size={1}>
                        {order.completedAt ? 'Completed' : 'Started'}: {formatDate(order.completedAt || order.startedAt)}
                      </Text>
                    </Stack>
                    <Stack space={1} style={{textAlign: 'right', minWidth: 160}}>
                      <Text weight="semibold">{currency.format(calculateWorkOrderCost(order))}</Text>
                      <Badge mode="outline">{order.status || 'not_started'}</Badge>
                    </Stack>
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text size={1} muted>
              No work orders recorded for this vehicle.
            </Text>
          )}
        </Stack>
      </Card>

      <Grid columns={[1, 2]} gap={4}>
        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Common Services
            </Text>
            {commonServices.length ? (
              <Stack space={2}>
                {commonServices.map(([service, count]) => (
                  <Flex key={service} justify="space-between">
                    <Text>{service}</Text>
                    <Text weight="semibold">{count}</Text>
                  </Flex>
                ))}
              </Stack>
            ) : (
              <Text size={1} muted>
                Not enough history to determine trends.
              </Text>
            )}
          </Stack>
        </Card>
        <Card padding={4} radius={3} shadow={1}>
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Parts Installed
            </Text>
            {partsSummary.length ? (
              <Stack space={2}>
                {partsSummary.map(([part, count]) => (
                  <Flex key={part} justify="space-between">
                    <Text>{part}</Text>
                    <Text weight="semibold">{count}</Text>
                  </Flex>
                ))}
              </Stack>
            ) : (
              <Text size={1} muted>
                No parts tracked for this vehicle yet.
              </Text>
            )}
          </Stack>
        </Card>
      </Grid>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Service Timeline
          </Text>
          {workOrders.length ? (
            <Stack space={2}>
              {workOrders.map((order) => (
                <Flex key={order._id} gap={3} align="center">
                  <Box
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: 'var(--card-border-color)',
                    }}
                  />
                  <Stack space={1}>
                    <Text weight="semibold">{formatDate(order.completedAt || order.startedAt)}</Text>
                    <Text size={1} muted>
                      {order.service?.title || 'Service'} • {order.workOrderNumber || order._id}
                    </Text>
                  </Stack>
                </Flex>
              ))}
            </Stack>
          ) : (
            <Text size={1} muted>
              Timeline will populate after the first work order is completed.
            </Text>
          )}
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Stack space={3}>
          <Text size={2} weight="semibold">
            Upcoming Service
          </Text>
          {data?.appointments?.length ? (
            <Stack space={2}>
              {data.appointments.map((appt) => (
                <Card key={appt._id} padding={3} radius={2} border>
                  <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
                    <Stack space={1}>
                      <Text weight="semibold">{appt.appointmentNumber || 'Appointment'}</Text>
                      <Text size={1} muted>{appt.service?.title || 'Service TBD'}</Text>
                    </Stack>
                    <Stack space={1} style={{textAlign: 'right'}}>
                      <Text>{formatDate(appt.scheduledDate)}</Text>
                      <Badge mode="outline">{appt.status || 'scheduled'}</Badge>
                    </Stack>
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text size={1} muted>
              No upcoming appointments scheduled.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}

export default VehicleServiceHistory
