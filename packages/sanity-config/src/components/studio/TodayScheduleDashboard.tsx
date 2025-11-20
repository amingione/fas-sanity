import {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@sanity/ui'

const API_VERSION = '2024-10-01'
const BAY_LABELS: Record<string, string> = {
  bay1: 'Bay 1',
  bay2: 'Bay 2',
  bay3: 'Bay 3',
  bay4: 'Bay 4',
}

type AppointmentRow = {
  _id: string
  appointmentNumber?: string
  scheduledDate?: string
  status?: string
  bay?: string
  customerName?: string
  serviceTitle?: string
  vehicleLabel?: string
  workOrder?: {_id: string; workOrderNumber?: string; status?: string} | null
}

type WorkOrderRow = {
  _id: string
  workOrderNumber?: string
  status?: string
  bay?: string
  startedAt?: string
  appointmentNumber?: string
  customerName?: string
  serviceTitle?: string
}

type CompletedRow = {
  _id: string
  workOrderNumber?: string
  completedAt?: string
  customerName?: string
  serviceTitle?: string
}

type DashboardData = {
  appointments: AppointmentRow[]
  workOrders: WorkOrderRow[]
  completed: CompletedRow[]
}

const initialData: DashboardData = {appointments: [], workOrders: [], completed: []}

const startOfDayIso = (): string => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

const endOfDayIso = (): string => {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  return now.toISOString()
}

const formatDateLabel = (value?: string) => {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const formatDateTime = (value?: string) => {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function TodayScheduleDashboard() {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const toast = useToast()
  const [data, setData] = useState<DashboardData>(initialData)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [startTarget, setStartTarget] = useState('')
  const [completeTarget, setCompleteTarget] = useState('')
  const [actionId, setActionId] = useState<'start' | 'complete' | null>(null)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const fetched = await client.fetch<DashboardData>(
        `{
          "appointments": *[_type == "appointment" && dateTime(scheduledDate) >= $start && dateTime(scheduledDate) <= $end] | order(dateTime(scheduledDate) asc){
            _id,
            appointmentNumber,
            scheduledDate,
            status,
            bay,
            "customerName": coalesce(
              [customer->firstName, customer->lastName][0] + ' ' + [customer->firstName, customer->lastName][1],
              customer->name,
              customer->email
            ),
            "serviceTitle": service->title,
            "vehicleLabel": select(
              defined(vehicle->year) => vehicle->year + ' ' + vehicle->make + ' ' + vehicle->model,
              vehicle->make
            ),
            workOrder->{_id, workOrderNumber, status}
          },
          "workOrders": *[_type == "workOrder" && status in ["not_started","in_progress","waiting_parts","waiting_approval"]] | order(dateTime(_createdAt) desc){
            _id,
            workOrderNumber,
            status,
            bay,
            startedAt,
            "appointmentNumber": appointment->appointmentNumber,
            "customerName": coalesce(
              customer->firstName + ' ' + customer->lastName,
              customer->name
            ),
            "serviceTitle": service->title
          },
          "completed": *[_type == "workOrder" && status == "completed" && defined(completedAt) && dateTime(completedAt) >= $start && dateTime(completedAt) <= $end]{
            _id,
            workOrderNumber,
            completedAt,
            "customerName": coalesce(
              customer->firstName + ' ' + customer->lastName,
              customer->name
            ),
            "serviceTitle": service->title
          }
        }`,
        {start: startOfDayIso(), end: endOfDayIso()},
      )
      setData({
        appointments: fetched?.appointments ?? [],
        workOrders: fetched?.workOrders ?? [],
        completed: fetched?.completed ?? [],
      })
    } catch (error) {
      console.error('schedule dashboard fetch failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to load schedule',
        description: 'Check your connection and try again.',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [client, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const startCandidates = useMemo(
    () => data.workOrders.filter((wo) => wo.status === 'not_started'),
    [data.workOrders],
  )
  const completeCandidates = useMemo(
    () => data.workOrders.filter((wo) => wo.status === 'in_progress'),
    [data.workOrders],
  )
  const activeWorkOrders = useMemo(
    () => data.workOrders.filter((wo) => wo.status !== 'not_started'),
    [data.workOrders],
  )

  const bayStatuses = useMemo(() => {
    const entries = Object.keys(BAY_LABELS).map((key) => {
      const occupant = activeWorkOrders.find((wo) => wo.bay === key)
      return {
        key,
        label: BAY_LABELS[key],
        status: occupant?.status ?? 'available',
        workOrder: occupant,
      }
    })
    return entries
  }, [activeWorkOrders])

  const handleStatusUpdate = useCallback(
    async (workOrderId: string, mode: 'start' | 'complete') => {
      if (!workOrderId) return
      setActionId(mode)
      try {
        const now = new Date().toISOString()
        const patch =
          mode === 'start'
            ? {status: 'in_progress', startedAt: now}
            : {status: 'completed', completedAt: now}
        await client.patch(workOrderId).set(patch).commit()
        toast.push({
          status: 'success',
          title: mode === 'start' ? 'Work order started' : 'Work order completed',
        })
        setStartTarget('')
        setCompleteTarget('')
        fetchData()
      } catch (error) {
        console.error('work order update failed', error)
        toast.push({
          status: 'error',
          title: 'Unable to update work order',
          description: 'Try again in a moment.',
        })
      } finally {
        setActionId(null)
      }
    },
    [client, fetchData, toast],
  )

  if (loading) {
    return (
      <Flex align="center" justify="center" height="fill">
        <Spinner muted />
      </Flex>
    )
  }

  return (
    <Box padding={4}>
      <Stack space={5}>
        <Flex justify="space-between" align="center">
          <Heading as="h2" size={3}>
            Today&apos;s Schedule
          </Heading>
          <Button
            text="Refresh"
            mode="bleed"
            loading={refreshing}
            onClick={() => fetchData()}
          />
        </Flex>

        <Grid columns={[1, 1, 3]} gap={4}>
          {bayStatuses.map((bay) => (
            <Card key={bay.key} padding={4} radius={3} border>
              <Stack space={3}>
                <Flex align="center" justify="space-between">
                  <Text weight="medium">{bay.label}</Text>
                  <Badge tone={bay.status === 'available' ? 'positive' : 'primary'}>
                    {bay.status === 'available'
                      ? 'Available'
                      : bay.workOrder?.status?.replace(/_/g, ' ') || 'Busy'}
                  </Badge>
                </Flex>
                {bay.workOrder ? (
                  <Stack space={1}>
                    <Text size={1} muted>
                      Work Order
                    </Text>
                    <Text weight="medium">{bay.workOrder.workOrderNumber}</Text>
                    <Text size={1}>{bay.workOrder.customerName || '—'}</Text>
                    <Text size={1} muted>
                      {bay.workOrder.serviceTitle || 'Service'}
                    </Text>
                  </Stack>
                ) : (
                  <Text size={1} muted>
                    No active work order assigned.
                  </Text>
                )}
              </Stack>
            </Card>
          ))}
        </Grid>

        <Card padding={4} radius={3} border>
          <Stack space={4}>
            <Heading as="h3" size={2}>
              Quick Actions
            </Heading>
            <Grid columns={[1, 1, 3]} gap={3}>
              <Stack space={2}>
                <Text size={1} muted>
                  Start Work Order
                </Text>
                <Select
                  value={startTarget}
                  onChange={(event) => setStartTarget(event.currentTarget.value)}
                >
                  <option value="">Select work order</option>
                  {startCandidates.map((wo) => (
                    <option key={wo._id} value={wo._id}>
                      {wo.workOrderNumber} • {wo.customerName || 'No customer'}
                    </option>
                  ))}
                </Select>
                <Button
                  text="Start"
                  disabled={!startTarget}
                  loading={actionId === 'start'}
                  onClick={() => handleStatusUpdate(startTarget, 'start')}
                />
              </Stack>
              <Stack space={2}>
                <Text size={1} muted>
                  Complete Work Order
                </Text>
                <Select
                  value={completeTarget}
                  onChange={(event) => setCompleteTarget(event.currentTarget.value)}
                >
                  <option value="">Select work order</option>
                  {completeCandidates.map((wo) => (
                    <option key={wo._id} value={wo._id}>
                      {wo.workOrderNumber} • {wo.customerName || 'No customer'}
                    </option>
                  ))}
                </Select>
                <Button
                  text="Complete"
                  disabled={!completeTarget}
                  tone="positive"
                  loading={actionId === 'complete'}
                  onClick={() => handleStatusUpdate(completeTarget, 'complete')}
                />
              </Stack>
              <Stack space={2}>
                <Text size={1} muted>
                  Book Appointment
                </Text>
                <Button
                  text="New Appointment"
                  tone="primary"
                  onClick={() => router.navigateIntent('create', {type: 'appointment'})}
                />
              </Stack>
            </Grid>
          </Stack>
        </Card>

        <Card padding={4} radius={3} border>
          <Stack space={3}>
            <Heading as="h3" size={2}>
              Today&apos;s Appointments
            </Heading>
            {data.appointments.length === 0 ? (
              <Text size={1} muted>
                No appointments on the books today.
              </Text>
            ) : (
              <Stack space={3}>
                {data.appointments.map((appt) => (
                  <Card key={appt._id} padding={3} radius={2} border>
                    <Flex align={['flex-start', 'center']} justify="space-between" wrap="wrap" gap={3}>
                      <Stack space={1}>
                        <Text weight="medium">
                          {appt.appointmentNumber} • {appt.customerName || 'No customer'}
                        </Text>
                        <Text size={1} muted>
                          {appt.serviceTitle || 'Service'} • {appt.vehicleLabel || 'Vehicle TBD'}
                        </Text>
                        <Text size={1}>{formatDateTime(appt.scheduledDate)}</Text>
                      </Stack>
                      <Stack space={1} style={{minWidth: 200}}>
                        <Badge mode="outline">{appt.status?.replace(/_/g, ' ') || 'Scheduled'}</Badge>
                        <Text size={1}>{BAY_LABELS[appt.bay ?? ''] || 'No bay assigned'}</Text>
                        {appt.workOrder ? (
                          <Button
                            text={`Open ${appt.workOrder.workOrderNumber}`}
                            mode="bleed"
                            onClick={() =>
                              router.navigateIntent('edit', {
                                id: appt.workOrder?._id,
                                type: 'workOrder',
                              })
                            }
                          />
                        ) : (
                          <Button
                            text="Create Work Order"
                            mode="bleed"
                            onClick={() =>
                              router.navigateIntent('create', {
                                type: 'workOrder',
                                templateParams: {appointmentId: appt._id},
                              })
                            }
                          />
                        )}
                      </Stack>
                    </Flex>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>

        <Card padding={4} radius={3} border>
          <Stack space={3}>
            <Heading as="h3" size={2}>
              Completed Today
            </Heading>
            {data.completed.length === 0 ? (
              <Text size={1} muted>
                No work orders completed yet today.
              </Text>
            ) : (
              <Stack space={3}>
                {data.completed.map((row) => (
                  <Flex key={row._id} justify="space-between" align="center">
                    <Stack space={1}>
                      <Text weight="medium">{row.workOrderNumber}</Text>
                      <Text size={1} muted>
                        {row.customerName} • {row.serviceTitle}
                      </Text>
                    </Stack>
                    <Text size={1}>{formatDateLabel(row.completedAt)}</Text>
                  </Flex>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
