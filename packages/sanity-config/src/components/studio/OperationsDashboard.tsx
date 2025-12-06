import React, {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useRouter} from 'sanity/router'
import {Badge, Box, Button, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {DocumentIcon, ResetIcon, WrenchIcon} from '@sanity/icons'
import {useWorkspaceClient} from '../../utils/useWorkspaceClient'
import {formatNumber, getToday} from '../../utils/dashboardUtils'
import {DataTable, MetricCard} from './dashboard'

const API_VERSION = '2024-10-01'
const REFRESH_INTERVAL = 30_000

const OPERATIONS_QUERY = `
{
  "workOrders": *[
    _type == "workOrder" &&
    !(_id in path("drafts.**")) &&
    status == "in_progress"
  ]{
    _id,
    workOrderNumber,
    bay,
    startedAt,
    service->{title},
    customer->{firstName,lastName,name}
  },
  "appointments": *[
    _type == "appointment" &&
    !(_id in path("drafts.**")) &&
    dateTime(scheduledDate) >= dateTime($todayStart) &&
    dateTime(scheduledDate) < dateTime($tomorrowStart)
  ] | order(scheduledDate asc){
    _id,
    appointmentNumber,
    scheduledDate,
    status,
    bay,
    customer->{firstName,lastName},
    service->{title},
    workOrder->{_id, status}
  },
  "metrics": {
    "inProgress": count(*[_type == "workOrder" && status == "in_progress"]),
    "waitingParts": count(*[_type == "workOrder" && status == "waiting_parts"]),
    "waitingApproval": count(*[_type == "workOrder" && status == "waiting_approval"]),
    "completedToday": count(*[
      _type == "workOrder" &&
      status == "completed" &&
      dateTime(completedAt) >= dateTime($todayStart)
    ])
  },
  "recentlyCompleted": *[
    _type == "workOrder" &&
    !(_id in path("drafts.**")) &&
    status == "completed" &&
    dateTime(completedAt) >= dateTime($thirtyDaysAgo)
  ]{
    laborHours
  },
  "partsNeeded": *[
    _type == "workOrder" &&
    status == "waiting_parts"
  ]{
    _id,
    workOrderNumber,
    service->{title},
    customer->{firstName,lastName},
    notes
  }
}
`

type RawWorkOrder = {
  _id: string
  workOrderNumber?: string | null
  bay?: string | null
  startedAt?: string | null
  service?: {title?: string | null} | null
  customer?: {firstName?: string | null; lastName?: string | null; name?: string | null} | null
}

type RawAppointment = {
  _id: string
  appointmentNumber?: string | null
  scheduledDate?: string | null
  status?: string | null
  bay?: string | null
  service?: {title?: string | null} | null
  customer?: {firstName?: string | null; lastName?: string | null} | null
  workOrder?: {_id?: string; status?: string | null} | null
}

type WorkOrderMetrics = {
  inProgress: number
  waitingParts: number
  waitingApproval: number
  completedToday: number
}

type RawPartsNeeded = {
  _id: string
  workOrderNumber?: string | null
  service?: {title?: string | null} | null
  customer?: {firstName?: string | null; lastName?: string | null} | null
  notes?: string | null
}

type OperationsResponse = {
  workOrders: RawWorkOrder[]
  appointments: RawAppointment[]
  metrics: WorkOrderMetrics
  recentlyCompleted: Array<{laborHours?: number | null}>
  partsNeeded: RawPartsNeeded[]
}

const BAY_LAYOUT = ['bay1', 'bay2', 'bay3', 'bay4']

const STATUS_BADGES: Record<
  string,
  {label: string; tone: 'positive' | 'caution' | 'critical' | 'primary'}
> = {
  completed: {label: 'Completed', tone: 'positive'},
  in_progress: {label: 'In progress', tone: 'primary'},
  scheduled: {label: 'Scheduled', tone: 'caution'},
  needs_confirmation: {label: 'Needs confirmation', tone: 'caution'},
  cancelled: {label: 'Cancelled', tone: 'critical'},
}

const timelineIcon = (status?: string | null) => {
  switch (status) {
    case 'completed':
      return '✅'
    case 'in_progress':
      return '🔧'
    case 'cancelled':
      return '❌'
    default:
      return '⏳'
  }
}

export const OperationsDashboard = forwardRef<HTMLDivElement>(function OperationsDashboard(
  _props,
  ref,
) {
  const client = useWorkspaceClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [data, setData] = useState<OperationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const averageCompletionTime = useMemo(() => {
    const completed = data?.recentlyCompleted ?? []
    if (!completed.length) return 0
    const total = completed.reduce((sum, item) => sum + Number(item.laborHours ?? 0), 0)
    return total / completed.length
  }, [data?.recentlyCompleted])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const today = getToday()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    try {
      const result = await client.fetch<OperationsResponse>(OPERATIONS_QUERY, {
        todayStart: today.toISOString(),
        tomorrowStart: tomorrow.toISOString(),
        thirtyDaysAgo: thirtyDaysAgo.toISOString(),
      })
      setData(result)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load operations data')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshIndex])

  useEffect(() => {
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  const navigateToWorkOrder = useCallback(
    (id?: string) => {
      if (!id) return
      if (router.navigateIntent) {
        router.navigateIntent('edit', {id, type: 'workOrder'})
      }
    },
    [router],
  )

  const navigateToAppointment = useCallback(
    (id: string) => {
      if (router.navigateIntent) {
        router.navigateIntent('edit', {id, type: 'appointment'})
      }
    },
    [router],
  )

  const handleStartWorkOrder = useCallback(() => {
    if (router.navigateUrl) {
      router.navigateUrl({
        path: '/desk/in-store-operations;in-store-work-orders;work-orders-all',
      })
    }
  }, [router])

  const handleCompleteWorkOrder = useCallback(() => {
    if (router.navigateUrl) {
      router.navigateUrl({
        path: '/desk/in-store-operations;in-store-work-orders;work-orders-in-progress',
      })
    }
  }, [router])

  const handlePrintSchedule = useCallback(() => {
    if (typeof window === 'undefined' || !data?.appointments?.length) return
    const lines = data.appointments
      .map((appointment) => {
        const time = appointment.scheduledDate
          ? new Date(appointment.scheduledDate).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })
          : '—'
        const customer =
          [appointment.customer?.firstName, appointment.customer?.lastName]
            .filter(Boolean)
            .join(' ') || 'Customer'
        return `${time} — ${customer} • ${appointment.service?.title || 'Service'}`
      })
      .join('\n')
    const printWindow = window.open('', '_blank', 'width=600,height=800')
    if (printWindow) {
      printWindow.document.write(`<pre>${lines}</pre>`)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
      printWindow.close()
    }
  }, [data])

  const bayAssignments = useMemo(() => {
    const assignments: Record<string, RawWorkOrder | undefined> = {}
    BAY_LAYOUT.forEach((bay) => {
      assignments[bay] = data?.workOrders?.find((order) => order.bay === bay)
    })
    return assignments
  }, [data])

  const partsNeededRows = data?.partsNeeded ?? []

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Stack space={2}>
            <Heading size={3}>Operations Dashboard</Heading>
            <Text muted size={1}>
              Live view of bays, appointments, and work orders.
            </Text>
          </Stack>
          <Flex gap={3}>
            <Button
              icon={ResetIcon}
              tone="primary"
              text="Refresh"
              mode="ghost"
              disabled={loading}
              onClick={() => setRefreshIndex((prev) => prev + 1)}
            />
            <Button
              icon={DocumentIcon}
              text="Print Schedule"
              mode="ghost"
              onClick={handlePrintSchedule}
              disabled={!data?.appointments?.length}
            />
          </Flex>
        </Flex>

        {error ? (
          <Card tone="critical" padding={4}>
            <Stack space={3}>
              <Text weight="bold">Unable to load operations</Text>
              <Text size={1}>{error}</Text>
              <Button text="Try again" tone="critical" onClick={fetchData} />
            </Stack>
          </Card>
        ) : null}

        {loading && !data ? (
          <Card padding={5}>
            <Flex align="center" justify="center" style={{minHeight: 200}}>
              <Text muted>Loading operations…</Text>
            </Flex>
          </Card>
        ) : (
          <>
            <Card padding={4} radius={3} shadow={1}>
              <Stack space={4}>
                <Heading size={2}>Service Bay Status</Heading>
                <Grid columns={[1, 2]} gap={3}>
                  {BAY_LAYOUT.map((bay) => {
                    const assignment = bayAssignments[bay]
                    const occupied = Boolean(assignment)
                    const startedAt = assignment?.startedAt ? new Date(assignment.startedAt) : null
                    const hoursElapsed = startedAt
                      ? ((Date.now() - startedAt.getTime()) / (1000 * 60 * 60)).toFixed(1)
                      : null
                    const customer =
                      assignment?.customer?.name ||
                      [assignment?.customer?.firstName, assignment?.customer?.lastName]
                        .filter(Boolean)
                        .join(' ') ||
                      'Customer'
                    return (
                      <Card
                        key={bay}
                        padding={4}
                        radius={3}
                        tone={occupied ? 'caution' : 'positive'}
                        style={{cursor: occupied ? 'pointer' : 'default'}}
                        onClick={() => occupied && navigateToWorkOrder(assignment?._id)}
                      >
                        <Stack space={2}>
                          <Flex align="center" justify="space-between">
                            <Text weight="bold">Bay {bay.replace('bay', '')}</Text>
                            <Badge tone={occupied ? 'caution' : 'positive'}>
                              {occupied ? 'Busy' : 'Available'}
                            </Badge>
                          </Flex>
                          {occupied ? (
                            <>
                              <Text size={1} muted>
                                {assignment?.service?.title || 'Service'}
                              </Text>
                              <Text size={1}>{customer}</Text>
                              {hoursElapsed && (
                                <Text size={1} muted>
                                  {hoursElapsed} hrs elapsed
                                </Text>
                              )}
                            </>
                          ) : (
                            <Text size={1} muted>
                              Ready for next job
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    )
                  })}
                </Grid>
              </Stack>
            </Card>

            <Grid columns={[1, 1, 2]} gap={4}>
              <Card padding={4} radius={3} shadow={1}>
                <Stack space={3}>
                  <Heading size={2}>Today&apos;s Schedule</Heading>
                  <Stack space={3}>
                    {(data?.appointments ?? []).length === 0 && (
                      <Text muted>No appointments scheduled today.</Text>
                    )}
                    {(data?.appointments ?? []).map((appointment) => {
                      const statusInfo = STATUS_BADGES[appointment.status || 'scheduled'] || {
                        label: appointment.status || 'Scheduled',
                        tone: 'primary',
                      }
                      const time = appointment.scheduledDate
                        ? new Date(appointment.scheduledDate).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '—'
                      const customer =
                        [appointment.customer?.firstName, appointment.customer?.lastName]
                          .filter(Boolean)
                          .join(' ') || 'Customer'
                      return (
                        <Flex
                          key={appointment._id}
                          gap={3}
                          align="flex-start"
                          style={{cursor: 'pointer'}}
                          onClick={() => navigateToAppointment(appointment._id)}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: 32,
                            }}
                          >
                            <Text>{timelineIcon(appointment.status)}</Text>
                            <div
                              style={{
                                width: 2,
                                flex: 1,
                                background: 'var(--card-border-color)',
                              }}
                            />
                          </div>
                          <Card padding={3} radius={2} shadow={1} style={{flex: 1}}>
                            <Flex align="center" justify="space-between">
                              <Text weight="bold">{time}</Text>
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                            </Flex>
                            <Text size={1}>{customer}</Text>
                            <Text size={1} muted>
                              {appointment.service?.title || 'Service'} • Bay{' '}
                              {appointment.bay?.replace('bay', '') || 'TBD'}
                            </Text>
                          </Card>
                        </Flex>
                      )
                    })}
                  </Stack>
                </Stack>
              </Card>

              <Stack space={4}>
                <Card padding={4} radius={3} shadow={1}>
                  <Stack space={3}>
                    <Heading size={2}>Work Order Metrics</Heading>
                    <Grid columns={[1, 2]} gap={3}>
                      <MetricCard
                        title="In Progress"
                        value={formatNumber(data?.metrics?.inProgress ?? 0)}
                        icon={<WrenchIcon />}
                        color="primary"
                      />
                      <MetricCard
                        title="Waiting for Parts"
                        value={formatNumber(data?.metrics?.waitingParts ?? 0)}
                        color="caution"
                      />
                      <MetricCard
                        title="Waiting Approval"
                        value={formatNumber(data?.metrics?.waitingApproval ?? 0)}
                        color="caution"
                      />
                      <MetricCard
                        title="Completed Today"
                        value={formatNumber(data?.metrics?.completedToday ?? 0)}
                        color="positive"
                      />
                      <MetricCard
                        title="Avg. Labor Hours (30d)"
                        value={formatNumber(averageCompletionTime)}
                      />
                    </Grid>
                  </Stack>
                </Card>

                <Card padding={4} radius={3} shadow={1}>
                  <Stack space={3}>
                    <Heading size={2}>Quick Actions</Heading>
                    <Flex gap={3} wrap="wrap">
                      <Button
                        text="Start Work Order"
                        tone="primary"
                        onClick={handleStartWorkOrder}
                      />
                      <Button
                        text="Complete Work Order"
                        tone="positive"
                        onClick={handleCompleteWorkOrder}
                      />
                      <Button
                        text="Print Schedule"
                        tone="default"
                        onClick={handlePrintSchedule}
                        disabled={!data?.appointments?.length}
                      />
                    </Flex>
                  </Stack>
                </Card>
              </Stack>
            </Grid>

            <Card padding={4} radius={3} shadow={1}>
              <Stack space={3}>
                <Heading size={2}>Parts Needed</Heading>
                <DataTable
                  columns={[
                    {key: 'workOrderNumber', title: 'Work Order', sortable: true},
                    {
                      key: 'customer',
                      title: 'Customer',
                      render: (row: RawPartsNeeded) =>
                        [row.customer?.firstName, row.customer?.lastName]
                          .filter(Boolean)
                          .join(' ') || 'Customer',
                    },
                    {
                      key: 'service',
                      title: 'Service',
                      render: (row: RawPartsNeeded) => row.service?.title || 'Service',
                    },
                    {
                      key: 'notes',
                      title: 'Notes',
                      render: (row: RawPartsNeeded) => row.notes || '—',
                    },
                  ]}
                  data={partsNeededRows}
                  isLoading={loading}
                  pageSize={5}
                  emptyState="No work orders waiting on parts."
                  rowKey={(row) => row._id}
                  onRowClick={(row) => navigateToWorkOrder(row._id)}
                />
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Box>
  )
})

OperationsDashboard.displayName = 'OperationsDashboard'

export default OperationsDashboard
