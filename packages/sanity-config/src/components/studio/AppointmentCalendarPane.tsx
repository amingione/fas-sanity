import {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Badge,
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'

const API_VERSION = '2024-10-01'
const RANGE_OPTIONS = [
  {label: '7 days', value: '7'},
  {label: '14 days', value: '14'},
  {label: '30 days', value: '30'},
]

type Appointment = {
  _id: string
  appointmentNumber?: string
  scheduledDate?: string
  status?: string
  bay?: string
  customerName?: string
  serviceTitle?: string
}

const formatDayLabel = (value: string) => {
  const date = new Date(value)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const AppointmentCalendarPane = forwardRef<HTMLDivElement, Record<string, unknown>>((_props, ref) => {
  const client = useClient({apiVersion: API_VERSION})
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [range, setRange] = useState('14')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const loadAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const results = await client.fetch<Appointment[]>(
        `*[_type == "appointment" && dateTime(scheduledDate) >= dateTime(now()) - 60*60*24] | order(dateTime(scheduledDate) asc)[0...400]{
          _id,
          appointmentNumber,
          scheduledDate,
          status,
          bay,
          "customerName": coalesce(customer->firstName + ' ' + customer->lastName, customer->name),
          "serviceTitle": service->title
        }`,
      )
      setAppointments(results ?? [])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  const grouped = useMemo(() => {
    const days = new Map<string, Appointment[]>()
    const limit = Number(range)
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(start)
    rangeEnd.setDate(rangeEnd.getDate() + limit)
    for (const appt of appointments) {
      if (!appt.scheduledDate) continue
      const date = new Date(appt.scheduledDate)
      if (date > rangeEnd) continue
      if (date < start) continue
      if (statusFilter !== 'all' && appt.status !== statusFilter) continue
      const key = date.toISOString().slice(0, 10)
      const list = days.get(key) ?? []
      list.push(appt)
      days.set(key, list)
    }
    return Array.from(days.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([key, entries]) => ({
        date: key,
        items: entries.sort((a, b) =>
          (a.scheduledDate || '').localeCompare(b.scheduledDate || ''),
        ),
      }))
  }, [appointments, range, statusFilter])

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
            Appointment Calendar
          </Heading>
          <Flex align="center" gap={3}>
            <Select value={range} onChange={(event) => setRange(event.currentTarget.value)}>
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  View next {option.label}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}>
              <option value="all">All statuses</option>
              <option value="needs_confirmation">Needs confirmation</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </Select>
          </Flex>
        </Flex>
        {grouped.length === 0 ? (
          <Card padding={4} radius={3} border>
            <Text muted>No appointments scheduled in this range.</Text>
          </Card>
        ) : (
          <Grid columns={[1, 1, 2, 3]} gap={4}>
            {grouped.map((group) => (
              <Card key={group.date} padding={4} radius={3} border>
                <Stack space={3}>
                  <Text weight="bold">{formatDayLabel(group.date)}</Text>
                  <Stack space={3}>
                    {group.items.map((item) => (
                      <Card key={item._id} padding={3} radius={2} tone="transparent" border>
                        <Stack space={2}>
                          <Flex align="center" justify="space-between">
                            <Text weight="medium">{item.appointmentNumber}</Text>
                            <Badge>{item.status?.replace(/_/g, ' ') || 'Scheduled'}</Badge>
                          </Flex>
                          <Text size={1}>{item.customerName || 'Customer TBD'}</Text>
                          <Text size={1} muted>
                            {item.serviceTitle || 'Service'} • {item.bay ? item.bay.replace('bay', 'Bay ') : 'Bay TBD'}
                          </Text>
                          <Text size={1}>
                            {item.scheduledDate
                              ? new Date(item.scheduledDate).toLocaleTimeString([], {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </Text>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Box>
  )
})

AppointmentCalendarPane.displayName = 'AppointmentCalendarPane'

export default AppointmentCalendarPane
