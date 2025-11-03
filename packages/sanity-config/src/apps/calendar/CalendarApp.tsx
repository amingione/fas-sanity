import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  Label,
  Spinner,
  Stack,
  Switch,
  Text,
  TextInput,
  TextArea,
  Select,
  useToast,
} from '@sanity/ui'
import {AddIcon, EditIcon, RefreshIcon} from '@sanity/icons'
import {
  addMinutes,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
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

const EVENT_QUERY = `*[_type == "calendarEvent"] | order(startAt asc, title asc) {
  _id,
  _createdAt,
  _updatedAt,
  title,
  startAt,
  endAt,
  allDay,
  location,
  notes,
  color
}`

const EVENT_LISTEN_QUERY = '*[_type == "calendarEvent"]'

type EventDocument = {
  _id: string
  _createdAt?: string
  _updatedAt?: string
  title?: string | null
  startAt?: string | null
  endAt?: string | null
  allDay?: boolean | null
  location?: string | null
  notes?: string | null
  color?: string | null
}

type CalendarEvent = {
  documentId: string
  draftId?: string
  publishedId?: string
  title: string | null
  startAt: string | null
  endAt: string | null
  allDay: boolean
  location: string | null
  notes: string | null
  color: string
  createdAt: string | null
  updatedAt: string | null
}

type NormalizedEvent = CalendarEvent & {sourceIsDraft?: boolean}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const EVENT_COLOR_STYLES: Record<string, {background: string; color: string; border: string}> = {
  default: {background: 'rgba(15, 23, 42, 0.08)', color: '#0f172a', border: 'rgba(15, 23, 42, 0.16)'},
  blue: {background: 'rgba(59, 130, 246, 0.18)', color: '#1d4ed8', border: 'rgba(37, 99, 235, 0.35)'},
  green: {background: 'rgba(34, 197, 94, 0.18)', color: '#15803d', border: 'rgba(22, 163, 74, 0.35)'},
  orange: {background: 'rgba(249, 115, 22, 0.18)', color: '#c2410c', border: 'rgba(234, 88, 12, 0.35)'},
  pink: {background: 'rgba(244, 114, 182, 0.18)', color: '#be185d', border: 'rgba(219, 39, 119, 0.35)'},
  purple: {background: 'rgba(168, 85, 247, 0.18)', color: '#6d28d9', border: 'rgba(126, 34, 206, 0.35)'},
  red: {background: 'rgba(248, 113, 113, 0.18)', color: '#b91c1c', border: 'rgba(239, 68, 68, 0.35)'},
}

type CreateEventFormState = {
  title: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  location: string
  notes: string
  color: string
}

const buildCreateFormState = (initialDate?: Date): CreateEventFormState => {
  const baseDate = initialDate || new Date()
  const defaultStart = setSafeTime(baseDate, 9, 0)
  const defaultEnd = addMinutes(defaultStart, 60)
  return {
    title: '',
    date: format(baseDate, 'yyyy-MM-dd'),
    startTime: format(defaultStart, 'HH:mm'),
    endTime: format(defaultEnd, 'HH:mm'),
    allDay: false,
    location: '',
    notes: '',
    color: 'default',
  }
}

function setSafeTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date)
  next.setHours(hours, minutes, 0, 0)
  return next
}

function formatDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function getEventColorStyle(color?: string) {
  return EVENT_COLOR_STYLES[color || 'default'] || EVENT_COLOR_STYLES.default
}

function formatEventTime(event: CalendarEvent) {
  if (!event.startAt) return 'No start time'

  if (event.allDay) return 'All day'

  try {
    const start = parseISO(event.startAt)
    const startLabel = format(start, 'h:mm a')

    if (event.endAt) {
      const end = parseISO(event.endAt)
      return `${startLabel} – ${format(end, 'h:mm a')}`
    }

    return startLabel
  } catch {
    return event.allDay ? 'All day' : 'Invalid date'
  }
}

function normalizeEvents(docs: EventDocument[]): CalendarEvent[] {
  const byId = new Map<string, NormalizedEvent>()

  docs.forEach((doc) => {
    const isDraft = doc._id.startsWith('drafts.')
    const documentId = isDraft ? doc._id.replace(/^drafts\./, '') : doc._id
    const existing = byId.get(documentId)

    const base: NormalizedEvent =
      existing || {
        documentId,
        draftId: undefined,
        publishedId: undefined,
        title: doc.title ?? null,
        startAt: doc.startAt ?? null,
        endAt: doc.endAt ?? null,
        allDay: doc.allDay ?? false,
        location: doc.location ?? null,
        notes: doc.notes ?? null,
        color: doc.color ?? 'default',
        createdAt: doc._createdAt ?? null,
        updatedAt: doc._updatedAt ?? doc._createdAt ?? null,
        sourceIsDraft: isDraft,
      }

    if (isDraft) {
      base.draftId = doc._id
    } else {
      base.publishedId = doc._id
    }

    if (!existing || isDraft || !base.sourceIsDraft) {
      base.title = doc.title ?? base.title ?? null
      base.startAt = doc.startAt ?? base.startAt ?? null
      base.endAt = doc.endAt ?? base.endAt ?? null
      base.allDay = doc.allDay ?? base.allDay ?? false
      base.location = doc.location ?? base.location ?? null
      base.notes = doc.notes ?? base.notes ?? null
      base.color = doc.color ?? base.color ?? 'default'
      base.createdAt = doc._createdAt ?? base.createdAt ?? null
      base.updatedAt = doc._updatedAt ?? base.updatedAt ?? doc._createdAt ?? base.updatedAt ?? null
      base.sourceIsDraft = isDraft
    }

    byId.set(documentId, base)
  })

  return Array.from(byId.values()).map(({sourceIsDraft, ...event}) => event)
}

const CalendarApp = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const {push: pushToast} = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateEventFormState>(() => buildCreateFormState())
  const [creating, setCreating] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docs = await client.fetch<EventDocument[]>(EVENT_QUERY, {}, {perspective: 'drafts'})
      setEvents(normalizeEvents(docs))
    } catch (err) {
      console.error('Failed to load calendar events', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const subscription = client
      .listen(EVENT_LISTEN_QUERY, {}, {visibility: 'query', tag: 'office-calendar'})
      .subscribe(() => {
        loadEvents()
      })

    return () => subscription.unsubscribe()
  }, [client, loadEvents])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    events.forEach((event) => {
      if (!event.startAt) return
      try {
        const date = parseISO(event.startAt)
        const key = formatDateKey(date)
        const list = map.get(key) || []
        list.push(event)
        map.set(key, list)
      } catch (err) {
        console.warn('Failed to parse event startAt', event.startAt, err)
      }
    })

    map.forEach((list, key) => {
      list.sort((a, b) => {
        if (!a.startAt || !b.startAt) return 0
        try {
          const aDate = parseISO(a.startAt)
          const bDate = parseISO(b.startAt)
          if (isBefore(aDate, bDate)) return -1
          if (isBefore(bDate, aDate)) return 1
          return (a.title || '').localeCompare(b.title || '')
        } catch {
          return 0
        }
      })
      map.set(key, list)
    })

    return map
  }, [events])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), {weekStartsOn: 1})
    const end = endOfWeek(endOfMonth(currentMonth), {weekStartsOn: 1})

    return eachDayOfInterval({start, end}).map((date) => {
      const key = formatDateKey(date)
      const isCurrent = isSameMonth(date, currentMonth)
      const isSelected = isSameDay(date, selectedDate)
      const dayEvents = eventsByDate.get(key) || []

      return {
        date,
        dateKey: key,
        events: dayEvents,
        isCurrentMonth: isCurrent,
        isToday: isToday(date),
        isSelected,
      }
    })
  }, [currentMonth, eventsByDate, selectedDate])

  const selectedDateEvents = useMemo(() => {
    const key = formatDateKey(selectedDate)
    return eventsByDate.get(key) || []
  }, [eventsByDate, selectedDate])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return events
      .filter((event) => {
        if (!event.startAt) return false
        try {
          const start = parseISO(event.startAt)
          return !isBefore(start, now)
        } catch {
          return false
        }
      })
      .sort((a, b) => {
        if (!a.startAt || !b.startAt) return 0
        const aDate = parseISO(a.startAt)
        const bDate = parseISO(b.startAt)
        if (isBefore(aDate, bDate)) return -1
        if (isBefore(bDate, aDate)) return 1
        return (a.title || '').localeCompare(b.title || '')
      })
      .slice(0, 12)
  }, [events])

  const openCreateDialog = useCallback(
    (initialDate?: Date) => {
      setCreateForm(buildCreateFormState(initialDate))
      setCreateDialogOpen(true)
    },
    [setCreateDialogOpen],
  )

  const closeCreateDialog = useCallback(() => {
    setCreateDialogOpen(false)
  }, [])

  const handleCreateFormChange = <K extends keyof CreateEventFormState>(
    key: K,
    value: CreateEventFormState[K],
  ) => {
    setCreateForm((prev) => ({...prev, [key]: value}))
  }

  const handleCreateEvent = useCallback(async () => {
    if (!createForm.title.trim()) {
      pushToast({
        status: 'warning',
        title: 'Give the event a title',
        description: 'Add a short title so the team knows what the event is.',
      })
      return
    }

    if (!createForm.date) {
      pushToast({
        status: 'warning',
        title: 'Pick a date',
        description: 'Select the day this event should appear on.',
      })
      return
    }

    const {date, startTime, endTime, allDay} = createForm

    const startDate = new Date(`${date}T${allDay ? '00:00' : startTime || '09:00'}:00`)
    const endDate =
      allDay || !endTime
        ? null
        : new Date(`${date}T${endTime}:00`)

    if (!allDay && endDate && endDate <= startDate) {
      pushToast({
        status: 'warning',
        title: 'End time must be after the start time',
      })
      return
    }

    setCreating(true)
    try {
      await client.create({
        _type: 'calendarEvent',
        title: createForm.title.trim(),
        startAt: startDate.toISOString(),
        endAt: endDate ? endDate.toISOString() : undefined,
        allDay,
        location: createForm.location.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
        color: createForm.color || 'default',
      })

      closeCreateDialog()
      pushToast({
        status: 'success',
        title: 'Event added',
        description: `${createForm.title.trim()} has been added to the calendar.`,
      })
      await loadEvents()
    } catch (err) {
      console.error('Failed to create calendar event', err)
      pushToast({
        status: 'error',
        title: 'Unable to create event',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      })
    } finally {
      setCreating(false)
    }
  }, [client, closeCreateDialog, createForm, loadEvents, pushToast])

  const handleNavigateMonth = useCallback(
    (direction: 'previous' | 'next' | 'today') => {
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
    },
    [currentMonth, selectedDate],
  )

  const handleOpenEvent = useCallback(
    (event: CalendarEvent) => {
      router.navigateIntent('edit', {id: event.documentId, type: 'calendarEvent'})
    },
    [router],
  )

  const selectedDayLabel = format(selectedDate, 'MMMM d, yyyy')
  const currentMonthLabel = format(currentMonth, 'MMMM yyyy')

  return (
    <div ref={ref} className="studio-page">
      <header className="studio-header">
        <div className="studio-header__inner">
          <div className="studio-header__titles">
            <h1 className="studio-header__title">Office calendar</h1>
            <p className="studio-header__description">
              Track shared office events, reminders, and schedules. Add items whenever the team needs them.
            </p>
          </div>
          <Flex gap={3} align="center" wrap="wrap">
            <Button
              icon={AddIcon}
              mode="ghost"
              text="New event"
              tone="primary"
              onClick={() => openCreateDialog(selectedDate)}
            />
            <Button
              icon={RefreshIcon}
              mode="ghost"
              text="Refresh"
              tone="default"
              onClick={loadEvents}
              disabled={loading}
            />
          </Flex>
        </div>
        <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent" className="mt-6 w-full">
          <Flex direction={['column', 'column', 'row']} align={['stretch', 'stretch', 'center']} gap={3}>
            <Flex gap={2} align="center">
              <Button mode="bleed" text="Today" onClick={() => handleNavigateMonth('today')} />
              <Button mode="bleed" text="Prev" onClick={() => handleNavigateMonth('previous')} />
              <Button mode="bleed" text="Next" onClick={() => handleNavigateMonth('next')} />
            </Flex>
            <Text size={2} weight="semibold">
              {currentMonthLabel}
            </Text>
          </Flex>
        </Card>
      </header>

      <main className="studio-body">
        {loading ? (
          <Card padding={5} radius={3} shadow={1} tone="transparent">
            <Flex align="center" justify="center" direction="column" gap={3}>
              <Spinner />
              <Text>Loading calendar…</Text>
            </Flex>
          </Card>
        ) : error ? (
          <Card padding={5} radius={3} shadow={1} tone="critical">
            <Stack space={3}>
              <Heading size={2}>Unable to load the calendar</Heading>
              <Text size={1}>{error}</Text>
              <Button text="Try again" tone="critical" onClick={loadEvents} />
            </Stack>
          </Card>
        ) : (
          <Flex direction={['column', 'column', 'row']} gap={[5, 5, 6]}>
            <Box flex={2}>
              <Stack space={4}>
                <Box
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gap: '8px',
                  }}
                >
                  {weekdayLabels.map((label) => (
                    <Text key={label} size={1} weight="semibold" style={{textAlign: 'center'}}>
                      {label}
                    </Text>
                  ))}
                </Box>
                <Box
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gap: '8px',
                  }}
                >
                  {days.map((day) => {
                    const borderColor = day.isSelected
                      ? 'var(--card-border-color-focus)'
                      : 'var(--card-border-color)'
                    const background = day.isToday
                      ? 'rgba(59, 130, 246, 0.08)'
                      : day.isCurrentMonth
                        ? 'var(--card-bg)'
                        : 'rgba(226, 232, 240, 0.4)'

                    return (
                      <Card
                        key={day.dateKey}
                        padding={3}
                        radius={2}
                        shadow={day.isSelected ? 2 : 1}
                        tone="transparent"
                        style={{
                          cursor: 'pointer',
                          border: `1px solid ${borderColor}`,
                          background,
                          transition: 'border-color 120ms ease, box-shadow 120ms ease',
                        }}
                        onClick={() => setSelectedDate(day.date)}
                        tabIndex={0}
                      >
                        <Flex justify="space-between" align="center">
                          <Text size={1} weight="semibold">
                            {format(day.date, 'd')}
                          </Text>
                          {!day.isCurrentMonth && (
                            <Badge mode="outline" tone="primary">
                              {format(day.date, 'MMM')}
                            </Badge>
                          )}
                        </Flex>
                        <Stack marginTop={3} space={2}>
                          {day.events.slice(0, 3).map((event) => {
                            const style = getEventColorStyle(event.color)
                            return (
                              <Card
                                key={event.documentId}
                                padding={2}
                                radius={2}
                                tone="transparent"
                                style={{
                                  background: style.background,
                                  color: style.color,
                                  border: `1px solid ${style.border}`,
                                  cursor: 'pointer',
                                }}
                                onClick={(evt) => {
                                  evt.stopPropagation()
                                  handleOpenEvent(event)
                                }}
                              >
                                <Stack space={2}>
                                  <Text size={1} weight="semibold">
                                    {event.title || 'Untitled event'}
                                  </Text>
                                  <Text size={0}>{formatEventTime(event)}</Text>
                                </Stack>
                              </Card>
                            )
                          })}
                          {day.events.length > 3 && (
                            <Text size={0} muted>
                              +{day.events.length - 3} more
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    )
                  })}
                </Box>
              </Stack>
            </Box>

            <Box flex={1}>
              <Stack space={5}>
                <Card padding={4} radius={3} shadow={1} tone="transparent">
                  <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
                    <Stack space={2}>
                      <Heading size={2}>{selectedDayLabel}</Heading>
                      <Text size={1} muted>
                        {selectedDateEvents.length} event{selectedDateEvents.length === 1 ? '' : 's'}
                      </Text>
                    </Stack>
                    <Button
                      icon={AddIcon}
                      text="Add event"
                      tone="primary"
                      mode="ghost"
                      onClick={() => openCreateDialog(selectedDate)}
                    />
                  </Flex>
                  <Stack marginTop={4} space={3}>
                    {selectedDateEvents.length === 0 ? (
                      <Card padding={3} radius={2} tone="transparent" shadow={0}>
                        <Text size={1} muted>
                          Nothing scheduled for this day yet.
                        </Text>
                      </Card>
                    ) : (
                      selectedDateEvents.map((event) => {
                        const style = getEventColorStyle(event.color)
                        return (
                          <Card
                            key={event.documentId}
                            padding={3}
                            radius={2}
                            shadow={1}
                            tone="transparent"
                            style={{
                              border: `1px solid ${style.border}`,
                              background: style.background,
                              color: style.color,
                            }}
                          >
                            <Stack space={3}>
                              <Flex align="center" justify="space-between">
                                <Stack space={1}>
                                  <Text size={1} weight="semibold">
                                    {event.title || 'Untitled event'}
                                  </Text>
                                  <Text size={0}>{formatEventTime(event)}</Text>
                                </Stack>
                                <Button
                                  icon={EditIcon}
                                  mode="bleed"
                                  tone="primary"
                                  onClick={() => handleOpenEvent(event)}
                                />
                              </Flex>
                              {event.location && (
                                <Text size={0}>
                                  <strong>Location:</strong> {event.location}
                                </Text>
                              )}
                              {event.notes && (
                                <Text size={0} style={{whiteSpace: 'pre-wrap'}}>
                                  {event.notes}
                                </Text>
                              )}
                            </Stack>
                          </Card>
                        )
                      })
                    )}
                  </Stack>
                </Card>

                <Card padding={4} radius={3} shadow={1} tone="transparent">
                  <Stack space={3}>
                    <Heading size={2}>Upcoming events</Heading>
                    {upcomingEvents.length === 0 ? (
                      <Text size={1} muted>
                        Nothing scheduled yet. Add a new event to get started.
                      </Text>
                    ) : (
                      <Stack space={3}>
                        {upcomingEvents.map((event) => {
                          const start = event.startAt ? parseISO(event.startAt) : null
                          const style = getEventColorStyle(event.color)
                          return (
                            <Card
                              key={`upcoming-${event.documentId}`}
                              padding={3}
                              radius={2}
                              shadow={1}
                              tone="transparent"
                              style={{
                                border: `1px solid ${style.border}`,
                                background: style.background,
                                color: style.color,
                              }}
                            >
                              <Stack space={2}>
                                <Flex align="center" justify="space-between">
                                  <Text size={1} weight="semibold">
                                    {event.title || 'Untitled event'}
                                  </Text>
                                  {start && (
                                    <Badge mode="outline" tone="primary">
                                      {format(start, 'MMM d')}
                                    </Badge>
                                  )}
                                </Flex>
                                <Text size={0}>{formatEventTime(event)}</Text>
                                <Button
                                  text="Open"
                                  tone="primary"
                                  mode="ghost"
                                  onClick={() => handleOpenEvent(event)}
                                />
                              </Stack>
                            </Card>
                          )
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Card>
              </Stack>
            </Box>
          </Flex>
        )}
      </main>

      {createDialogOpen && (
        <Dialog
          header="Add calendar event"
          id="office-calendar-create-dialog"
          onClose={closeCreateDialog}
          width={1}
        >
          <Stack as="form" space={4} onSubmit={(event) => event.preventDefault()}>
            <Stack space={2}>
              <Label htmlFor="calendar-event-title">Title</Label>
              <TextInput
                id="calendar-event-title"
                value={createForm.title}
                onChange={(event) => handleCreateFormChange('title', event.currentTarget.value)}
                placeholder="What is happening?"
              />
            </Stack>
            <Flex gap={3} wrap="wrap">
              <Box flex={1} style={{minWidth: '180px'}}>
                <Stack space={2}>
                  <Label htmlFor="calendar-event-date">Date</Label>
                  <TextInput
                    id="calendar-event-date"
                    type="date"
                    value={createForm.date}
                    onChange={(event) => handleCreateFormChange('date', event.currentTarget.value)}
                  />
                </Stack>
              </Box>
              {!createForm.allDay && (
                <>
                  <Box flex={1} style={{minWidth: '140px'}}>
                    <Stack space={2}>
                      <Label htmlFor="calendar-event-start">Starts</Label>
                      <TextInput
                        id="calendar-event-start"
                        type="time"
                        value={createForm.startTime}
                        onChange={(event) =>
                          handleCreateFormChange('startTime', event.currentTarget.value)
                        }
                      />
                    </Stack>
                  </Box>
                  <Box flex={1} style={{minWidth: '140px'}}>
                    <Stack space={2}>
                      <Label htmlFor="calendar-event-end">Ends</Label>
                      <TextInput
                        id="calendar-event-end"
                        type="time"
                        value={createForm.endTime}
                        onChange={(event) =>
                          handleCreateFormChange('endTime', event.currentTarget.value)
                        }
                      />
                    </Stack>
                  </Box>
                </>
              )}
            </Flex>
            <Flex align="center" gap={2}>
              <Switch
                id="calendar-event-all-day"
                checked={createForm.allDay}
                onChange={(event) => handleCreateFormChange('allDay', event.currentTarget.checked)}
              />
              <label htmlFor="calendar-event-all-day">
                <Text size={1}>All-day event</Text>
              </label>
            </Flex>
            <Stack space={2}>
              <Label htmlFor="calendar-event-location">Location</Label>
              <TextInput
                id="calendar-event-location"
                value={createForm.location}
                onChange={(event) => handleCreateFormChange('location', event.currentTarget.value)}
                placeholder="Conference room, Zoom, etc."
              />
            </Stack>
            <Stack space={2}>
              <Label htmlFor="calendar-event-notes">Notes</Label>
              <TextArea
                id="calendar-event-notes"
                value={createForm.notes}
                onChange={(event) => handleCreateFormChange('notes', event.currentTarget.value)}
                rows={3}
                placeholder="Add any extra context for the team."
              />
            </Stack>
            <Stack space={2}>
              <Label htmlFor="calendar-event-color">Label color</Label>
              <Select
                id="calendar-event-color"
                value={createForm.color}
                onChange={(event) => handleCreateFormChange('color', event.currentTarget.value)}
              >
                <option value="default">Default</option>
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="orange">Orange</option>
                <option value="pink">Pink</option>
                <option value="purple">Purple</option>
                <option value="red">Red</option>
              </Select>
            </Stack>
            <Flex justify="flex-end" gap={3}>
              <Button
                text="Cancel"
                mode="bleed"
                tone="default"
                onClick={closeCreateDialog}
                disabled={creating}
              />
              <Button
                text="Create event"
                tone="primary"
                onClick={handleCreateEvent}
                loading={creating}
              />
            </Flex>
          </Stack>
        </Dialog>
      )}
    </div>
  )
})

CalendarApp.displayName = 'CalendarApp'

export default CalendarApp
