import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Inline,
  Menu,
  MenuButton,
  MenuItem,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@sanity/ui'
import {AddIcon, EditIcon, RefreshIcon} from '@sanity/icons'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

const BOOKING_QUERY = `*[_type == "booking"] | order(_updatedAt desc) {
   _id,
   _createdAt,
   _updatedAt,
   bookingId,
   service,
   scheduledAt,
   status,
   notes,
   createdAt,
   "documentId": select(startsWith(_id, "drafts.") => replace(_id, "drafts.", ""), _id),
   "isDraft": startsWith(_id, "drafts."),
   customer->{
     _id,
     firstName,
     lastName,
     name,
     email,
     phone
   }
 }`

const BOOKING_LISTEN_QUERY = '*[_type == "booking"]'

const DEFAULT_APPOINTMENT_HOUR = 9

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_TONES: Record<string, {background: string; color: string}> = {
  confirmed: {background: 'rgba(34,211,238,0.12)', color: '#06b6d4'},
  rescheduled: {background: 'rgba(252,211,77,0.12)', color: '#f59e0b'},
  cancelled: {background: 'rgba(248,113,113,0.12)', color: '#f87171'},
  'no-show': {background: 'rgba(239,68,68,0.12)', color: '#ef4444'},
}

type BookingCustomer = {
  _id?: string
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}

type BookingQueryResult = {
  _id: string
  _createdAt?: string
  _updatedAt?: string
  documentId: string
  isDraft: boolean
  bookingId?: string | null
  service?: string | null
  scheduledAt?: string | null
  status?: string | null
  notes?: string | null
  createdAt?: string | null
  customer?: BookingCustomer | null
}

type CalendarBooking = {
  documentId: string
  draftId?: string
  publishedId?: string
  bookingId?: string | null
  service?: string | null
  scheduledAt?: string | null
  status?: string | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  customer?: BookingCustomer | null
}

function formatDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function getCustomerName(customer?: BookingCustomer | null) {
  if (!customer) return 'Unassigned customer'
  const first = customer.firstName?.trim()
  const last = customer.lastName?.trim()
  if (first || last) return [first, last].filter(Boolean).join(' ')
  if (customer.name?.trim()) return customer.name.trim()
  if (customer.email?.trim()) return customer.email.trim()
  if (customer.phone?.trim()) return customer.phone.trim()
  return 'Unassigned customer'
}

function normalizeBookings(docs: BookingQueryResult[]): CalendarBooking[] {
  const byDocument = new Map<string, CalendarBooking & {sourceIsDraft?: boolean}>()

  docs.forEach((doc) => {
    const existing = byDocument.get(doc.documentId)
    const base: CalendarBooking & {sourceIsDraft?: boolean} = existing || {
      documentId: doc.documentId,
      draftId: undefined,
      publishedId: undefined,
      bookingId: doc.bookingId ?? null,
      service: doc.service ?? null,
      scheduledAt: doc.scheduledAt ?? null,
      status: doc.status ?? null,
      notes: doc.notes ?? null,
      createdAt: doc.createdAt ?? doc._createdAt ?? null,
      updatedAt: doc._updatedAt ?? doc._createdAt ?? null,
      customer: doc.customer ?? null,
      sourceIsDraft: doc.isDraft,
    }

    if (doc.isDraft) {
      base.draftId = doc._id
    } else {
      base.publishedId = doc._id
    }

    if (!existing || doc.isDraft || !base.sourceIsDraft) {
      base.bookingId = doc.bookingId ?? null
      base.service = doc.service ?? null
      base.scheduledAt = doc.scheduledAt ?? null
      base.status = doc.status ?? null
      base.notes = doc.notes ?? null
      base.createdAt = doc.createdAt ?? doc._createdAt ?? base.createdAt ?? null
      base.updatedAt = doc._updatedAt ?? doc._createdAt ?? base.updatedAt ?? null
      base.customer = doc.customer ?? null
      base.sourceIsDraft = doc.isDraft
    }

    byDocument.set(doc.documentId, base)
  })

  return Array.from(byDocument.values()).map(({sourceIsDraft, ...record}) => record)
}

const CalendarApp = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const {push: pushToast} = useToast()

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<CalendarBooking[]>([])
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docs = await client.fetch<BookingQueryResult[]>(
        BOOKING_QUERY,
        {},
        {perspective: 'previewDrafts'},
      )
      setBookings(normalizeBookings(docs))
    } catch (err) {
      console.error('Failed to load booking calendar data', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useEffect(() => {
    const subscription = client
      .listen(BOOKING_LISTEN_QUERY, {}, {visibility: 'query', tag: 'calendar-app'})
      .subscribe(() => {
        loadBookings()
      })

    return () => subscription.unsubscribe()
  }, [client, loadBookings])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>()
    bookings.forEach((booking) => {
      if (!booking.scheduledAt) return
      try {
        const date = parseISO(booking.scheduledAt)
        const key = formatDateKey(date)
        const list = map.get(key) || []
        list.push(booking)
        map.set(key, list)
      } catch (err) {
        console.warn('Failed to parse booking date', booking.scheduledAt, err)
      }
    })

    map.forEach((list, key) => {
      list.sort((a, b) => {
        if (!a.scheduledAt || !b.scheduledAt) return 0
        const aDate = parseISO(a.scheduledAt)
        const bDate = parseISO(b.scheduledAt)
        if (isBefore(aDate, bDate)) return -1
        if (isBefore(bDate, aDate)) return 1
        return 0
      })
      map.set(key, list)
    })

    return map
  }, [bookings])

  const bookingsById = useMemo(() => {
    return new Map(bookings.map((booking) => [booking.documentId, booking]))
  }, [bookings])

  const unscheduledBookings = useMemo(
    () => bookings.filter((booking) => !booking.scheduledAt),
    [bookings],
  )

  const upcomingBookings = useMemo(() => {
    const now = new Date()
    const filtered = bookings.filter((booking) => {
      if (!booking.scheduledAt) return false
      try {
        const date = parseISO(booking.scheduledAt)
        return !isBefore(date, now)
      } catch {
        return false
      }
    })

    filtered.sort((a, b) => {
      if (!a.scheduledAt || !b.scheduledAt) return 0
      const aDate = parseISO(a.scheduledAt)
      const bDate = parseISO(b.scheduledAt)
      if (isBefore(aDate, bDate)) return -1
      if (isBefore(bDate, aDate)) return 1
      return 0
    })

    return filtered
  }, [bookings])

  const filteredUpcoming = useMemo(() => {
    if (statusFilter === 'all') return upcomingBookings
    return upcomingBookings.filter((booking) => (booking.status || 'unspecified') === statusFilter)
  }, [statusFilter, upcomingBookings])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), {weekStartsOn: 1})
    const end = endOfWeek(endOfMonth(currentMonth), {weekStartsOn: 1})

    return eachDayOfInterval({start, end}).map((date) => {
      const key = formatDateKey(date)
      const events = eventsByDate.get(key) || []
      return {
        date,
        dateKey: key,
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isToday(date),
        isSelected: isSameDay(date, selectedDate),
        events,
      }
    })
  }, [currentMonth, eventsByDate, selectedDate])

  const selectedDateEvents = useMemo(() => {
    const key = formatDateKey(selectedDate)
    return eventsByDate.get(key) || []
  }, [eventsByDate, selectedDate])

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>()
    bookings.forEach((booking) => {
      const status = booking.status || 'unspecified'
      counts.set(status, (counts.get(status) || 0) + 1)
    })
    const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    return [
      {id: 'all', label: 'All', count: bookings.length},
      ...entries.map(([id, count]) => ({id, label: id, count})),
    ]
  }, [bookings])

  const handleNavigateMonth = (direction: 'previous' | 'next' | 'today') => {
    if (direction === 'previous') {
      const next = subMonths(currentMonth, 1)
      setCurrentMonth(next)
      if (!isSameMonth(selectedDate, next)) {
        setSelectedDate(next)
      }
    } else if (direction === 'next') {
      const next = addMonths(currentMonth, 1)
      setCurrentMonth(next)
      if (!isSameMonth(selectedDate, next)) {
        setSelectedDate(next)
      }
    } else {
      const today = new Date()
      setCurrentMonth(startOfMonth(today))
      setSelectedDate(today)
    }
  }

  const handleOpenDocument = useCallback(
    (booking: CalendarBooking) => {
      router.navigateIntent('edit', {id: booking.documentId, type: 'booking'})
    },
    [router],
  )

  const handleCreateBooking = useCallback(
    (_initialDate?: Date) => {
      router.navigateIntent('create', {type: 'booking'})
    },
    [router],
  )

  const applyReschedule = useCallback(
    async (booking: CalendarBooking, nextDate: Date | null) => {
      const nextIso = nextDate ? nextDate.toISOString() : null
      const currentIso = booking.scheduledAt || null
      if (nextIso === currentIso) {
        setHoveredDateKey(null)
        return
      }

      const transaction = client.transaction()
      let hasMutations = false

      const applyPatch = (id: string) => {
        if (!id) return
        if (nextIso) {
          transaction.patch(id, {set: {scheduledAt: nextIso}})
        } else {
          transaction.patch(id, {unset: ['scheduledAt']})
        }
        hasMutations = true
      }

      if (booking.publishedId) {
        applyPatch(booking.documentId)
      }

      if (booking.draftId) {
        applyPatch(booking.draftId)
      }

      if (!booking.publishedId && !booking.draftId) {
        applyPatch(booking.documentId)
      }

      if (!hasMutations) {
        return
      }

      setReschedulingId(booking.documentId)
      try {
        await transaction.commit({tag: 'calendar-app-reschedule'})
        setBookings((prev) =>
          prev.map((item) =>
            item.documentId === booking.documentId ? {...item, scheduledAt: nextIso} : item,
          ),
        )
        pushToast({
          status: 'success',
          title: nextIso ? 'Appointment rescheduled' : 'Appointment unscheduled',
          description: nextIso
            ? format(parseISO(nextIso), "MMMM d, yyyy 'at' h:mmaaa")
            : 'This appointment is now unscheduled.',
        })
      } catch (err) {
        console.error('Failed to reschedule booking', err)
        pushToast({
          status: 'error',
          title: 'Unable to update appointment',
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        })
        loadBookings()
      } finally {
        setReschedulingId(null)
        setHoveredDateKey(null)
      }
    },
    [client, loadBookings, pushToast],
  )

  const handleDropOnDate = useCallback(
    (dateKey: string, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setHoveredDateKey(null)
      const documentId = event.dataTransfer.getData('application/x-calendar-doc-id')
      if (!documentId) return
      const booking = bookingsById.get(documentId)
      if (!booking) return

      const originalIso =
        event.dataTransfer.getData('application/x-calendar-original-start') ||
        booking.scheduledAt ||
        ''

      const [year, month, day] = dateKey.split('-').map((segment) => parseInt(segment, 10))
      const base = new Date(Date.UTC(year, month - 1, day))
      if (originalIso) {
        const originalDate = parseISO(originalIso)
        base.setUTCHours(
          originalDate.getUTCHours(),
          originalDate.getUTCMinutes(),
          originalDate.getUTCSeconds(),
          originalDate.getUTCMilliseconds(),
        )
      } else {
        base.setUTCHours(DEFAULT_APPOINTMENT_HOUR, 0, 0, 0)
      }

      applyReschedule(booking, base)
    },
    [applyReschedule, bookingsById],
  )

  const handleDropUnscheduled = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const documentId = event.dataTransfer.getData('application/x-calendar-doc-id')
      if (!documentId) return
      const booking = bookingsById.get(documentId)
      if (!booking) return
      applyReschedule(booking, null)
    },
    [applyReschedule, bookingsById],
  )

  const handleDragStart = (event: React.DragEvent<HTMLElement>, booking: CalendarBooking) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-calendar-doc-id', booking.documentId)
    if (booking.scheduledAt) {
      event.dataTransfer.setData('application/x-calendar-original-start', booking.scheduledAt)
    }
  }

  const handleDragEnter = (dateKey: string) => setHoveredDateKey(dateKey)
  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>, dateKey: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setHoveredDateKey((prev) => (prev === dateKey ? null : prev))
    }
  }

  const selectedDayLabel = format(selectedDate, 'MMMM do, yyyy')
  const currentMonthLabel = format(currentMonth, 'MMMM yyyy')

  return (
    <div ref={ref} className="studio-page">
      <header className="studio-header">
        <div className="studio-header__inner">
          <div className="studio-header__titles">
            <h1 className="studio-header__title">Appointments calendar</h1>
            <p className="studio-header__description">
              Use the calendar to monitor service bookings and general meetings. Drag and drop
              appointments to reschedule.
            </p>
          </div>
          <Flex gap={3} align="center" wrap="wrap">
            <Button
              icon={AddIcon}
              mode="ghost"
              text="New appointment"
              tone="primary"
              onClick={() => handleCreateBooking(selectedDate)}
            />
            <Button
              icon={RefreshIcon}
              mode="ghost"
              text="Refresh"
              tone="default"
              onClick={loadBookings}
              disabled={loading}
            />
          </Flex>
        </div>
        <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent" className="mt-6 w-full">
          <Flex
            direction={['column', 'column', 'row']}
            align={['stretch', 'stretch', 'center']}
            gap={3}
          >
            <Flex gap={2} align="center">
              <Button mode="bleed" text="Today" onClick={() => handleNavigateMonth('today')} />
              <Button mode="bleed" text="Prev" onClick={() => handleNavigateMonth('previous')} />
              <Button mode="bleed" text="Next" onClick={() => handleNavigateMonth('next')} />
            </Flex>
            <Text size={2} weight="semibold">
              {currentMonthLabel}
            </Text>
            <Flex gap={2} wrap="wrap">
              {statusOptions.map((option) => {
                const isActive = statusFilter === option.id
                return (
                  <Button
                    key={option.id}
                    mode={isActive ? 'default' : 'ghost'}
                    tone={isActive ? 'primary' : 'default'}
                    onClick={() => setStatusFilter(option.id)}
                    text={`${option.label} (${option.count})`}
                  />
                )
              })}
            </Flex>
          </Flex>
        </Card>
      </header>

      <main className="studio-content">
        {loading && (
          <Card padding={4} radius={3} shadow={1} tone="transparent">
            <Flex gap={3} align="center">
              <Spinner />
              <Text size={2}>Loading appointments…</Text>
            </Flex>
          </Card>
        )}

        {error && (
          <Card padding={4} radius={3} shadow={1} tone="caution">
            <Stack space={3}>
              <Heading size={1}>Unable to load calendar</Heading>
              <Text size={2}>{error}</Text>
              <Button text="Try again" tone="primary" onClick={loadBookings} />
            </Stack>
          </Card>
        )}

        {!loading && !error && (
          <Flex direction={['column', 'column', 'row']} gap={4}>
            <Box flex={2}>
              <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                <Stack space={3}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: '0.35rem',
                      fontSize: 12,
                      textTransform: 'uppercase',
                      color: '#9ca3af',
                    }}
                  >
                    {weekdayLabels.map((label) => (
                      <span key={label} style={{textAlign: 'center'}}>
                        {label}
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: '0.5rem',
                    }}
                  >
                    {days.map((day) => {
                      const isHovered = hoveredDateKey === day.dateKey
                      return (
                        <Card
                          key={day.dateKey}
                          padding={2}
                          radius={2}
                          shadow={isHovered ? 2 : 1}
                          tone="transparent"
                          style={{
                            minHeight: 120,
                            background: day.isSelected
                              ? 'rgba(59,130,246,0.1)'
                              : day.isCurrentMonth
                                ? 'rgba(15,23,42,0.45)'
                                : 'rgba(15,23,42,0.2)',
                            border: isHovered
                              ? '1px solid rgba(59,130,246,0.5)'
                              : '1px solid transparent',
                            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                          }}
                          onDragEnter={() => handleDragEnter(day.dateKey)}
                          onDragLeave={(event) => handleDragLeave(event, day.dateKey)}
                          onDrop={(event) => handleDropOnDate(day.dateKey, event)}
                        >
                          <Stack space={2}>
                            <Flex align="center" justify="space-between">
                              <Button
                                mode="bleed"
                                tone="default"
                                text={format(day.date, 'd')}
                                fontSize={1}
                                onClick={() => setSelectedDate(day.date)}
                                style={{
                                  color: day.isToday ? '#f8fafc' : undefined,
                                  fontWeight: day.isToday ? 600 : 400,
                                }}
                              />
                              <MenuButton
                                id={`calendar-day-menu-${day.dateKey}`}
                                button={
                                  <Button
                                    icon={AddIcon}
                                    mode="bleed"
                                    tone="default"
                                    aria-label="Add"
                                  />
                                }
                                menu={
                                  <Menu>
                                    <MenuItem
                                      icon={AddIcon}
                                      text="Create appointment"
                                      onClick={() => handleCreateBooking(day.date)}
                                    />
                                  </Menu>
                                }
                                popover={{portal: true}}
                              />
                            </Flex>

                            <Stack space={2}>
                              {day.events.length === 0 && (
                                <Text size={1} muted>
                                  No events
                                </Text>
                              )}

                              {day.events.map((event) => {
                                const tone = event.status ? STATUS_TONES[event.status] : undefined
                                const isUpdating = reschedulingId === event.documentId
                                return (
                                  <Card
                                    key={event.documentId}
                                    padding={2}
                                    radius={2}
                                    shadow={1}
                                    draggable
                                    onDragStart={(dragEvent) => handleDragStart(dragEvent, event)}
                                    onDoubleClick={() => handleOpenDocument(event)}
                                    style={{
                                      cursor: 'grab',
                                      background: tone?.background || 'rgba(15,23,42,0.9)',
                                      color: tone?.color || '#e5e7eb',
                                      border: isUpdating
                                        ? '1px dashed rgba(96,165,250,0.6)'
                                        : '1px solid transparent',
                                      opacity: isUpdating ? 0.6 : 1,
                                    }}
                                  >
                                    <Stack space={2}>
                                      <Flex align="center" justify="space-between" gap={2}>
                                        <Text size={1} weight="semibold">
                                          {event.scheduledAt
                                            ? format(parseISO(event.scheduledAt), 'h:mm a')
                                            : 'Unsched.'}
                                        </Text>
                                        <Button
                                          icon={EditIcon}
                                          mode="bleed"
                                          tone="default"
                                          aria-label="Open appointment"
                                          onClick={() => handleOpenDocument(event)}
                                        />
                                      </Flex>
                                      <Text size={1}>{getCustomerName(event.customer)}</Text>
                                      {event.service && (
                                        <Text size={1} muted>
                                          {event.service}
                                        </Text>
                                      )}
                                      {event.status && (
                                        <Badge
                                          mode="outline"
                                          tone="default"
                                          style={{
                                            borderColor: tone?.color || 'rgba(148,163,184,0.4)',
                                            color: tone?.color,
                                          }}
                                        >
                                          {event.status}
                                        </Badge>
                                      )}
                                    </Stack>
                                  </Card>
                                )
                              })}
                            </Stack>
                          </Stack>
                        </Card>
                      )
                    })}
                  </div>
                </Stack>
              </Card>
            </Box>

            <Box flex={1}>
              <Stack space={4}>
                <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                  <Stack space={3}>
                    <Heading size={1}>{selectedDayLabel}</Heading>
                    {selectedDateEvents.length === 0 ? (
                      <Text size={1} muted>
                        No appointments for this day yet.
                      </Text>
                    ) : (
                      <Stack space={3}>
                        {selectedDateEvents.map((event) => {
                          const tone = event.status ? STATUS_TONES[event.status] : undefined
                          const isUpdating = reschedulingId === event.documentId
                          return (
                            <Card
                              key={event.documentId}
                              padding={3}
                              radius={2}
                              shadow={1}
                              style={{
                                background: 'rgba(15,23,42,0.85)',
                                border: isUpdating
                                  ? '1px dashed rgba(96,165,250,0.6)'
                                  : '1px solid transparent',
                              }}
                            >
                              <Stack space={2}>
                                <Flex align="center" justify="space-between">
                                  <Text size={1} weight="semibold">
                                    {event.scheduledAt
                                      ? format(parseISO(event.scheduledAt), 'h:mm a')
                                      : 'Unscheduled'}
                                  </Text>
                                  {event.status && (
                                    <Badge
                                      tone="default"
                                      style={{
                                        backgroundColor:
                                          tone?.background || 'rgba(148,163,184,0.15)',
                                        color: tone?.color || '#e2e8f0',
                                      }}
                                    >
                                      {event.status}
                                    </Badge>
                                  )}
                                </Flex>
                                <Text size={1}>{getCustomerName(event.customer)}</Text>
                                {event.service && (
                                  <Text size={1} muted>
                                    {event.service}
                                  </Text>
                                )}
                                <Button
                                  text="Open in editor"
                                  tone="primary"
                                  mode="ghost"
                                  onClick={() => handleOpenDocument(event)}
                                />
                              </Stack>
                            </Card>
                          )
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Card>

                <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                  <Stack space={3}>
                    <Heading size={1}>Upcoming appointments</Heading>
                    {filteredUpcoming.length === 0 ? (
                      <Text size={1} muted>
                        No appointments match the selected filter.
                      </Text>
                    ) : (
                      <Stack space={3}>
                        {filteredUpcoming.slice(0, 20).map((event) => (
                          <Card
                            key={`upcoming-${event.documentId}`}
                            padding={3}
                            radius={2}
                            shadow={1}
                            style={{background: 'rgba(15,23,42,0.85)'}}
                          >
                            <Stack space={2}>
                              <Flex align="center" justify="space-between">
                                <Text size={1} weight="semibold">
                                  {event.scheduledAt
                                    ? format(parseISO(event.scheduledAt), 'MMM d, h:mm a')
                                    : 'Unscheduled'}
                                </Text>
                                <Text size={1} muted>
                                  {event.scheduledAt
                                    ? formatDistanceToNow(parseISO(event.scheduledAt), {
                                        addSuffix: true,
                                      })
                                    : ''}
                                </Text>
                              </Flex>
                              <Text size={1}>{getCustomerName(event.customer)}</Text>
                              {event.service && (
                                <Text size={1} muted>
                                  {event.service}
                                </Text>
                              )}
                              <Inline space={2}>
                                <Button
                                  text="Open"
                                  mode="ghost"
                                  tone="primary"
                                  onClick={() => handleOpenDocument(event)}
                                />
                                <Button
                                  text="Reschedule"
                                  mode="ghost"
                                  onClick={() => {
                                    if (!event.scheduledAt) return
                                    const date = parseISO(event.scheduledAt)
                                    setSelectedDate(date)
                                    setCurrentMonth(startOfMonth(date))
                                  }}
                                />
                              </Inline>
                            </Stack>
                          </Card>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Card>

                <Card
                  padding={[3, 4]}
                  radius={3}
                  shadow={1}
                  tone="transparent"
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={handleDropUnscheduled}
                >
                  <Stack space={3}>
                    <Heading size={1}>Unscheduled queue</Heading>
                    <Text size={1} muted>
                      Drop any appointment here to remove it from the calendar. Drag items from this
                      list onto a day to schedule them.
                    </Text>
                    {unscheduledBookings.length === 0 ? (
                      <Text size={1} muted>
                        Nothing waiting. Create a new appointment to get started.
                      </Text>
                    ) : (
                      <Stack space={3}>
                        {unscheduledBookings.map((event) => (
                          <Card
                            key={`unscheduled-${event.documentId}`}
                            padding={3}
                            radius={2}
                            shadow={1}
                            draggable
                            onDragStart={(dragEvent) => handleDragStart(dragEvent, event)}
                            style={{background: 'rgba(15,23,42,0.8)', cursor: 'grab'}}
                          >
                            <Stack space={2}>
                              <Text size={1} weight="semibold">
                                {getCustomerName(event.customer)}
                              </Text>
                              {event.service && (
                                <Text size={1} muted>
                                  {event.service}
                                </Text>
                              )}
                              <Inline space={2}>
                                <Button
                                  text="Schedule"
                                  mode="ghost"
                                  onClick={() => {
                                    setSelectedDate(new Date())
                                  }}
                                />
                                <Button
                                  text="Open"
                                  mode="ghost"
                                  tone="primary"
                                  onClick={() => handleOpenDocument(event)}
                                />
                              </Inline>
                            </Stack>
                          </Card>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Card>
              </Stack>
            </Box>
          </Flex>
        )}
      </main>
    </div>
  )
})

CalendarApp.displayName = 'CalendarApp'

export default CalendarApp
