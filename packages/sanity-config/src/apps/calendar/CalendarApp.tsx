import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Inline,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useToast,
} from '@sanity/ui'
import {AddIcon, BellIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, RefreshIcon} from '@sanity/icons'
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

import {
  BookingCustomer,
  CalendarBooking,
  CalendarTask,
  TASK_BADGE_DESCRIPTIONS,
  TASK_BADGE_STYLES,
  computeSnoozedReminder,
  computeTaskSyncPlan,
  computeTaskTiming,
  formatDateForStorage,
  isoTimesEqual,
  deriveBookingStatusFromTaskAction,
  parseDateSafe,
  resolveTaskBadge,
  summarizeTaskBadges,
  withRetry,
} from './shared'

const CUSTOMER_PROJECTION = `{
  _id,
  firstName,
  lastName,
  name,
  email,
  phone
}`

const BOOKING_PROJECTION = `{
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
  customer->${CUSTOMER_PROJECTION}
}`

const BOOKING_QUERY = `*[_type == "booking"] | order(_updatedAt desc) ${BOOKING_PROJECTION}`

const BOOKING_LISTEN_QUERY = '*[_type == "booking"]'

const DEFAULT_APPOINTMENT_HOUR = 9

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_TONES: Record<string, {background: string; color: string}> = {
  confirmed: {background: 'rgba(34,211,238,0.12)', color: '#06b6d4'},
  rescheduled: {background: 'rgba(252,211,77,0.12)', color: '#f59e0b'},
  cancelled: {background: 'rgba(248,113,113,0.12)', color: '#f87171'},
  'no-show': {background: 'rgba(239,68,68,0.12)', color: '#ef4444'},
  completed: {background: 'rgba(34,197,94,0.12)', color: '#22c55e'},
  snoozed: {background: 'rgba(96,165,250,0.12)', color: '#60a5fa'},
}

const TASK_QUERY = `*[_type == "calendarTask"] | order(dueAt asc) {
  _id,
  title,
  status,
  dueAt,
  remindAt,
  notes,
  booking->${BOOKING_PROJECTION},
  assignedTo->${CUSTOMER_PROJECTION}
}`

const TASK_LISTEN_QUERY = '*[_type == "calendarTask"]'

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

type TaskQueryResult = {
  _id: string
  title?: string | null
  status?: string | null
  dueAt?: string | null
  remindAt?: string | null
  notes?: string | null
  booking?: BookingQueryResult | null
  assignedTo?: BookingCustomer | null
}

function normalizeTasks(docs: TaskQueryResult[]): CalendarTask[] {
  return docs.map((doc) => {
    const booking = doc.booking ? normalizeBookings([doc.booking])[0] : null
    return {
      _id: doc._id,
      title: doc.title?.trim() || 'Calendar task',
      status: doc.status || 'pending',
      dueAt: doc.dueAt ?? null,
      remindAt: doc.remindAt ?? null,
      notes: doc.notes ?? null,
      booking,
      assignedTo: doc.assignedTo ?? null,
    }
  })
}

const CalendarApp = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const {push: pushToast} = useToast()

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<CalendarBooking[]>([])
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([])
  const addPendingTask = useCallback((id: string) => {
    setPendingTaskIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])
  const removePendingTask = useCallback((id: string) => {
    setPendingTaskIds((prev) => prev.filter((item) => item !== id))
  }, [])

  const pendingTaskCreationRef = useRef<Set<string>>(new Set())

  const loadCalendarData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bookingDocs, taskDocs] = await Promise.all([
        client.fetch<BookingQueryResult[]>(BOOKING_QUERY, {}, {perspective: 'previewDrafts'}),
        client.fetch<TaskQueryResult[]>(TASK_QUERY, {}, {perspective: 'previewDrafts'}),
      ])
      setBookings(normalizeBookings(bookingDocs))
      setTasks(normalizeTasks(taskDocs))
    } catch (err) {
      console.error('Failed to load booking calendar data', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadCalendarData()
  }, [loadCalendarData])

  useEffect(() => {
    const bookingSubscription = client
      .listen(BOOKING_LISTEN_QUERY, {}, {visibility: 'query', tag: 'calendar-app'})
      .subscribe(() => {
        loadCalendarData()
      })

    const taskSubscription = client
      .listen(TASK_LISTEN_QUERY, {}, {visibility: 'query', tag: 'calendar-app-tasks'})
      .subscribe(() => {
        loadCalendarData()
      })

    return () => {
      bookingSubscription.unsubscribe()
      taskSubscription.unsubscribe()
    }
  }, [client, loadCalendarData])

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

  const tasksByBookingId = useMemo(() => {
    const map = new Map<string, CalendarTask>()
    tasks.forEach((task) => {
      if (task.booking) {
        map.set(task.booking.documentId, task)
      }
    })
    return map
  }, [tasks])

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

  const selectedDateTasks = useMemo(() => {
    const key = formatDateKey(selectedDate)
    return tasks.filter((task) => {
      const scheduled = task.booking?.scheduledAt
      if (!scheduled) return false
      const parsed = parseDateSafe(scheduled)
      if (!parsed) return false
      return formatDateKey(parsed) === key
    })
  }, [selectedDate, tasks])

  const upcomingTaskReminders = useMemo(() => {
    const now = new Date()
    const items = tasks
      .filter((task) => task.status !== 'completed')
      .map((task) => {
        const due = parseDateSafe(task.dueAt || task.booking?.scheduledAt || null)
        const remind = parseDateSafe(task.remindAt)
        return {
          task,
          due,
          remind,
          isOverdue: due ? isBefore(due, now) : false,
        }
      })
      .filter((item) => item.due || item.remind)

    items.sort((a, b) => {
      const aTime = a.remind?.getTime() || a.due?.getTime() || Number.MAX_SAFE_INTEGER
      const bTime = b.remind?.getTime() || b.due?.getTime() || Number.MAX_SAFE_INTEGER
      return aTime - bTime
    })

    return items
  }, [tasks])

  const ensureTasksForBookings = useCallback(async () => {
    if (!bookings.length) return

    const createdSummaries: string[] = []
    const completedSummaries: string[] = []
    const reopenedSummaries: string[] = []

    let didMutate = false

    for (const booking of bookings) {
      const existingTask = tasksByBookingId.get(booking.documentId)
      const plan = computeTaskSyncPlan(booking, existingTask ?? null)

      if (plan.shouldCreate) {
        if (pendingTaskCreationRef.current.has(booking.documentId)) {
          continue
        }

        pendingTaskCreationRef.current.add(booking.documentId)

        try {
          const existingCount = await client.fetch<number>(
            'count(*[_type == "calendarTask" && references($bookingId)])',
            {bookingId: booking.documentId},
            {perspective: 'previewDrafts'},
          )

          if (existingCount > 0) {
            continue
          }

          await withRetry(
            () =>
              client.create(
                {
                  _type: 'calendarTask',
                  title: `Follow up with ${getCustomerName(booking.customer)}`,
                  status: 'pending',
                  dueAt: plan.dueAtIso,
                  remindAt: plan.remindAtIso,
                  notes: booking.notes || undefined,
                  booking: {
                    _type: 'reference',
                    _ref: booking.documentId,
                  },
                  assignedTo: plan.assignedRef,
                },
                {tag: 'calendar-app-task-auto-create'},
              ),
            {attempts: 3, delayMs: 600},
          )

          didMutate = true
          createdSummaries.push(getCustomerName(booking.customer))
        } catch (err) {
          console.error('Failed to create calendar task', err)
          pushToast({
            status: 'error',
            title: 'Unable to create reminder task',
            description: err instanceof Error ? err.message : 'An unexpected error occurred.',
          })
        } finally {
          pendingTaskCreationRef.current.delete(booking.documentId)
        }

        continue
      }

      if (!existingTask) {
        continue
      }

      const {setPayload, unsetPayload, statusChange} = plan

      if (Object.keys(setPayload).length === 0 && unsetPayload.length === 0) {
        continue
      }

      try {
        await withRetry(() => {
          let patchBuilder = client.patch(existingTask._id)
          if (Object.keys(setPayload).length > 0) {
            patchBuilder = patchBuilder.set(setPayload)
          }
          if (unsetPayload.length > 0) {
            patchBuilder = patchBuilder.unset(unsetPayload)
          }

          return patchBuilder.commit({tag: 'calendar-app-task-sync'})
        })

        if (statusChange === 'complete') {
          completedSummaries.push(getCustomerName(booking.customer))
        } else if (statusChange === 'reopen') {
          reopenedSummaries.push(getCustomerName(booking.customer))
        }

        didMutate = true
      } catch (err) {
        console.error('Failed to sync calendar task', err)
        pushToast({
          status: 'error',
          title: 'Unable to update reminder task',
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        })
      }
    }

    if (didMutate) {
      await loadCalendarData()
    }

    const summarize = (records: string[]) => {
      if (!records.length) return ''
      if (records.length === 1) return records[0]
      const [first, second, ...rest] = records
      return rest.length > 0 ? `${first}, ${second}${rest.length ? ` +${rest.length} more` : ''}` : `${first}, ${second}`
    }

    if (createdSummaries.length > 0) {
      pushToast({
        status: 'success',
        title: createdSummaries.length === 1 ? 'Reminder task created' : 'Reminder tasks created',
        description: `Scheduled follow-ups for ${summarize(createdSummaries)}.`,
      })
    }

    if (completedSummaries.length > 0) {
      pushToast({
        status: 'success',
        title: completedSummaries.length === 1 ? 'Task completed automatically' : 'Tasks completed automatically',
        description: `Marked reminders done for ${summarize(completedSummaries)} based on booking status.`,
      })
    }

    if (reopenedSummaries.length > 0) {
      pushToast({
        status: 'info',
        title: reopenedSummaries.length === 1 ? 'Task reopened' : 'Tasks reopened',
        description: `Reactivated follow-ups for ${summarize(reopenedSummaries)}.`,
      })
    }
  }, [bookings, client, loadCalendarData, pushToast, tasksByBookingId])

  useEffect(() => {
    ensureTasksForBookings().catch((err) => {
      console.error('Failed to ensure calendar tasks', err)
    })
  }, [ensureTasksForBookings])

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>()
    bookings.forEach((booking) => {
      const status = booking.status || 'unspecified'
      counts.set(status, (counts.get(status) || 0) + 1)
    })
    const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    return [{id: 'all', label: 'All', count: bookings.length}, ...entries.map(([id, count]) => ({id, label: id, count}))]
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

  const handleOpenTask = useCallback(
    (task: CalendarTask) => {
      router.navigateIntent('edit', {id: task._id, type: 'calendarTask'})
    },
    [router],
  )

  const syncBookingStatusFromTask = useCallback(
    async (action: 'complete' | 'snooze', task: CalendarTask) => {
      if (!task.booking) return

      const nextStatus = deriveBookingStatusFromTaskAction(action, task.booking.status)
      if (!nextStatus || task.booking.status === nextStatus) {
        return
      }

      try {
        await withRetry(() => {
          const transaction = client.transaction()
          let hasMutations = false

          const patchBooking = (id?: string | null) => {
            if (!id) return
            transaction.patch(id, {set: {status: nextStatus}})
            hasMutations = true
          }

          patchBooking(task.booking?.documentId)
          patchBooking(task.booking?.draftId)

          if (!hasMutations) {
            return Promise.resolve(undefined)
          }

          return transaction.commit({tag: 'calendar-app-booking-sync'})
        })

        setBookings((prev) =>
          prev.map((booking) =>
            booking.documentId === task.booking?.documentId
              ? {...booking, status: nextStatus}
              : booking,
          ),
        )

        setTasks((prev) =>
          prev.map((item) =>
            item._id === task._id
              ? {
                  ...item,
                  booking: item.booking
                    ? {
                        ...item.booking,
                        status: nextStatus,
                      }
                    : item.booking,
                }
              : item,
          ),
        )
      } catch (err) {
        console.error('Failed to sync booking status from task', err)
        pushToast({
          status: 'warning',
          title: 'Booking status update failed',
          description:
            err instanceof Error
              ? err.message
              : 'Unable to reflect the reminder change on the booking.',
        })
      }
    },
    [client, pushToast],
  )

  const handleCompleteTask = useCallback(
    async (task: CalendarTask) => {
      addPendingTask(task._id)
      try {
        await withRetry(() =>
          client
            .patch(task._id, {set: {status: 'completed'}})
            .commit({tag: 'calendar-app-task-complete'}),
        )

        const updatedTask: CalendarTask = {...task, status: 'completed'}

        setTasks((prev) =>
          prev.map((item) => (item._id === task._id ? {...item, status: 'completed'} : item)),
        )

        await syncBookingStatusFromTask('complete', updatedTask)

        pushToast({
          status: 'success',
          title: 'Task marked complete',
          description: `Marked "${task.title}" as completed.`,
        })
      } catch (err) {
        console.error('Failed to complete calendar task', err)
        pushToast({
          status: 'error',
          title: 'Unable to mark task complete',
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        })
      } finally {
        removePendingTask(task._id)
      }
    },
    [addPendingTask, client, pushToast, removePendingTask, syncBookingStatusFromTask],
  )

  const handleSnoozeTask = useCallback(
    async (task: CalendarTask) => {
      addPendingTask(task._id)
      const nextReminder = computeSnoozedReminder(task)
      const nextReminderIso = formatDateForStorage(nextReminder)

      try {
        await withRetry(() =>
          client
            .patch(task._id, {set: {remindAt: nextReminderIso}})
            .commit({tag: 'calendar-app-task-snooze'}),
        )

        setTasks((prev) =>
          prev.map((item) => (item._id === task._id ? {...item, remindAt: nextReminderIso} : item)),
        )

        await syncBookingStatusFromTask('snooze', {...task})

        pushToast({
          status: 'success',
          title: 'Reminder snoozed',
          description: `We will remind you ${format(nextReminder, "MMM d, h:mm a")}.`,
        })
      } catch (err) {
        console.error('Failed to snooze calendar task', err)
        pushToast({
          status: 'error',
          title: 'Unable to snooze reminder',
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        })
      } finally {
        removePendingTask(task._id)
      }
    },
    [addPendingTask, client, pushToast, removePendingTask, setTasks, syncBookingStatusFromTask],
  )

  const applyReschedule = useCallback(
    async (booking: CalendarBooking, nextDate: Date | null) => {
      const nextIso = nextDate ? formatDateForStorage(nextDate) : null
      const currentIso = booking.scheduledAt || null
      if (isoTimesEqual(currentIso, nextIso)) {
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
        await withRetry(() => transaction.commit({tag: 'calendar-app-reschedule'}))
        setBookings((prev) =>
          prev.map((item) =>
            item.documentId === booking.documentId ? {...item, scheduledAt: nextIso} : item,
          ),
        )

        const relatedTask = tasksByBookingId.get(booking.documentId)
        if (relatedTask) {
          const updatedBooking: CalendarBooking = {...booking, scheduledAt: nextIso}
          const {dueAtIso, remindAtIso} = computeTaskTiming(updatedBooking, nextDate)

          try {
            await withRetry(() =>
              client
                .patch(relatedTask._id, {
                  set: {
                    dueAt: dueAtIso,
                    remindAt: remindAtIso,
                  },
                })
                .commit({tag: 'calendar-app-task-sync'}),
            )

            setTasks((prev) =>
              prev.map((task) =>
                task._id === relatedTask._id
                  ? {
                      ...task,
                      dueAt: dueAtIso,
                      remindAt: remindAtIso,
                      booking: task.booking ? {...task.booking, scheduledAt: nextIso} : task.booking,
                    }
                  : task,
              ),
            )

            pushToast({
              status: 'success',
              title: 'Reminder updated',
              description: `Task timing synced to ${format(nextDate ?? new Date(dueAtIso), "MMM d, h:mm a")}.`,
            })
          } catch (taskErr) {
            console.error('Failed to update calendar task timing', taskErr)
          }
        }

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
        loadCalendarData()
      } finally {
        setReschedulingId(null)
        setHoveredDateKey(null)
      }
    },
    [client, loadCalendarData, pushToast, setTasks, tasksByBookingId],
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
        event.dataTransfer.getData('application/x-calendar-original-start') || booking.scheduledAt || ''

      const [year, month, day] = dateKey.split('-').map((segment) => parseInt(segment, 10))
      const base = new Date(year, month - 1, day)
      if (originalIso) {
        const originalDate = parseISO(originalIso)
        base.setHours(
          originalDate.getHours(),
          originalDate.getMinutes(),
          originalDate.getSeconds(),
          originalDate.getMilliseconds(),
        )
      } else {
        base.setHours(DEFAULT_APPOINTMENT_HOUR, 0, 0, 0)
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
              Use the calendar to monitor service bookings and general meetings. Drag and drop appointments
              to reschedule.
            </p>
          </div>
          <Flex gap={2} align="center" wrap="wrap">
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
              onClick={loadCalendarData}
              disabled={loading}
            />
          </Flex>
        </div>
        <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent" className="mt-6 w-full">
          <Flex direction={['column', 'column', 'row']} align={['stretch', 'stretch', 'center']} gap={3} wrap="wrap">
            <Flex gap={2} align="center">
              <Button
                icon={ChevronLeftIcon}
                mode="ghost"
                tone="default"
                aria-label="Previous month"
                onClick={() => handleNavigateMonth('previous')}
              />
              <Heading as="h2" size={2} style={{margin: 0}}>
                {currentMonthLabel}
              </Heading>
              <Button
                icon={ChevronRightIcon}
                mode="ghost"
                tone="default"
                aria-label="Next month"
                onClick={() => handleNavigateMonth('next')}
              />
              <Button mode="bleed" text="Today" onClick={() => handleNavigateMonth('today')} />
            </Flex>
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
              <Button text="Try again" tone="primary" onClick={loadCalendarData} />
            </Stack>
          </Card>
        )}

        {!loading && !error && (
          <Flex direction={['column', 'column', 'row']} gap={4}>
            <Box flex={2} minWidth={0}>
              <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                <Stack space={4}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: '0.5rem',
                      fontSize: 12,
                      textTransform: 'uppercase',
                      color: '#94a3b8',
                      letterSpacing: '0.08em',
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
                      gap: '0.75rem',
                    }}
                  >
                    {days.map((day) => {
                      const isHovered = hoveredDateKey === day.dateKey
                      const visibleEvents =
                        statusFilter === 'all'
                          ? day.events
                          : day.events.filter((event) => (event.status || 'unspecified') === statusFilter)
                      const dayTasks = day.events
                        .map((event) => tasksByBookingId.get(event.documentId))
                        .filter((task): task is CalendarTask => Boolean(task))

                      const dayTaskCount = dayTasks.length
                      const dayTaskVariant = dayTasks.length ? summarizeTaskBadges(dayTasks) : null
                      const dayTaskStyles = dayTaskVariant ? TASK_BADGE_STYLES[dayTaskVariant] : null

                      return (
                        <Card
                          key={day.dateKey}
                          padding={3}
                          radius={3}
                          shadow={isHovered ? 2 : 1}
                          tone="transparent"
                          style={{
                            minHeight: 150,
                            background: day.isSelected
                              ? 'rgba(59,130,246,0.14)'
                              : day.isCurrentMonth
                              ? 'rgba(15,23,42,0.55)'
                              : 'rgba(15,23,42,0.25)',
                            border: isHovered
                              ? '1px solid rgba(59,130,246,0.5)'
                              : day.isToday
                              ? '1px solid rgba(148,163,184,0.5)'
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
                          <Stack space={3}>
                            <Flex align="center" justify="space-between" gap={2} wrap="wrap">
                              <Button
                                mode="bleed"
                                tone="default"
                                text={format(day.date, 'd')}
                                fontSize={2}
                                onClick={() => setSelectedDate(day.date)}
                                style={{
                                  color: day.isToday ? '#f8fafc' : undefined,
                                  fontWeight: day.isToday ? 600 : 500,
                                }}
                              />
                              <Inline space={2} style={{alignItems: 'center'}}>
                                {dayTaskCount > 0 && (
                                  <Badge
                                    mode="outline"
                                    tone={dayTaskStyles?.tone}
                                    style={{
                                      borderColor: dayTaskStyles?.borderColor,
                                      background: dayTaskStyles?.background,
                                      color: dayTaskStyles?.textColor,
                                      textTransform: 'capitalize',
                                    }}
                                  >
                                    <Flex align="center" gap={2}>
                                      <BellIcon style={{width: 12, height: 12}} />
                                      <Text size={0}>{dayTaskCount}</Text>
                                      {dayTaskStyles && <Text size={0}>{dayTaskStyles.label}</Text>}
                                    </Flex>
                                  </Badge>
                                )}
                                <Button
                                  icon={AddIcon}
                                  mode="bleed"
                                  tone="default"
                                  aria-label="Create appointment"
                                  onClick={() => handleCreateBooking(day.date)}
                                />
                              </Inline>
                            </Flex>

                            <Stack space={2}>
                              {visibleEvents.length === 0 ? (
                                <Text size={1} muted>
                                  {day.events.length === 0 ? 'Available' : 'No events match this filter'}
                                </Text>
                              ) : (
                                visibleEvents.map((event) => {
                                  const tone = event.status ? STATUS_TONES[event.status] : undefined
                                  const isUpdating = reschedulingId === event.documentId
                                  const associatedTask = tasksByBookingId.get(event.documentId)
                                  const taskBadge = associatedTask ? resolveTaskBadge(associatedTask) : null
                                  const taskBadgeStyles = taskBadge
                                    ? TASK_BADGE_STYLES[taskBadge.variant]
                                    : null
                                  const matchesFilter =
                                    statusFilter === 'all' || (event.status || 'unspecified') === statusFilter

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
                                        background: tone?.background || 'rgba(15,23,42,0.85)',
                                        color: tone?.color || '#e2e8f0',
                                        border: isUpdating
                                          ? '1px dashed rgba(96,165,250,0.6)'
                                          : '1px solid rgba(15,23,42,0.1)',
                                        opacity: matchesFilter ? 1 : 0.65,
                                      }}
                                    >
                                      <Stack space={1}>
                                        <Flex align="center" justify="space-between" gap={2}>
                                          <Text size={1} weight="semibold">
                                            {event.scheduledAt
                                              ? format(parseISO(event.scheduledAt), 'h:mm a')
                                              : 'Unscheduled'}
                                          </Text>
                                          <Inline space={2} style={{alignItems: 'center'}}>
                                            {associatedTask && taskBadgeStyles && (
                                              <Tooltip
                                                portal
                                                content={
                                                  <Box padding={2} style={{maxWidth: 220}}>
                                                    <Text size={1}>
                                                      {TASK_BADGE_DESCRIPTIONS[taskBadge.variant]}
                                                    </Text>
                                                  </Box>
                                                }
                                              >
                                                <Badge
                                                  tone={taskBadgeStyles.tone}
                                                  style={{
                                                    borderColor: taskBadgeStyles.borderColor,
                                                    background: taskBadgeStyles.background,
                                                    color: taskBadgeStyles.textColor,
                                                    textTransform: 'capitalize',
                                                  }}
                                                >
                                                  <Flex align="center" gap={1}>
                                                    <BellIcon style={{width: 12, height: 12}} />
                                                    <Text size={0}>{taskBadgeStyles.label}</Text>
                                                  </Flex>
                                                </Badge>
                                              </Tooltip>
                                            )}
                                            <Button
                                              icon={EditIcon}
                                              mode="bleed"
                                              tone="default"
                                              aria-label="Open appointment"
                                              onClick={() => handleOpenDocument(event)}
                                            />
                                          </Inline>
                                        </Flex>
                                        <Text size={1}>{getCustomerName(event.customer)}</Text>
                                        {event.service && (
                                          <Text size={0} muted>
                                            {event.service}
                                          </Text>
                                        )}
                                        {event.status && (
                                          <Badge
                                            mode="outline"
                                            tone="default"
                                            style={{
                                              borderColor: tone?.color || 'rgba(148,163,184,0.4)',
                                              color: tone?.color || '#f1f5f9',
                                            }}
                                          >
                                            {event.status}
                                          </Badge>
                                        )}
                                      </Stack>
                                    </Card>
                                  )
                                })
                              )}
                            </Stack>
                          </Stack>
                        </Card>
                      )
                    })}
                  </div>
                </Stack>
              </Card>
            </Box>

            <Box flex={1} minWidth={0}>
              <Stack space={4}>
                <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                  <Stack space={4}>
                    <Flex align={['flex-start', 'center']} justify="space-between" wrap="wrap" gap={2}>
                      <Heading size={1}>{selectedDayLabel}</Heading>
                      <Button
                        icon={AddIcon}
                        mode="ghost"
                        tone="primary"
                        text="New appointment"
                        onClick={() => handleCreateBooking(selectedDate)}
                      />
                    </Flex>
                    <Stack space={3}>
                      <Heading size={1}>Appointments</Heading>
                      {selectedDateEvents.length === 0 ? (
                        <Text size={1} muted>No appointments for this day yet.</Text>
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
                                    : '1px solid rgba(15,23,42,0.2)',
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
                                          backgroundColor: tone?.background || 'rgba(148,163,184,0.15)',
                                          color: tone?.color || '#e2e8f0',
                                        }}
                                      >
                                        {event.status}
                                      </Badge>
                                    )}
                                  </Flex>
                                  <Text size={1}>{getCustomerName(event.customer)}</Text>
                                  {event.service && (
                                    <Text size={0} muted>
                                      {event.service}
                                    </Text>
                                  )}
                                  <Inline space={2}>
                                    <Button text="Open" tone="primary" mode="ghost" onClick={() => handleOpenDocument(event)} />
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
                            )
                          })}
                        </Stack>
                      )}
                    </Stack>
                    <Stack space={3}>
                      <Flex align={['flex-start', 'center']} justify="space-between" gap={2} wrap="wrap">
                        <Flex align="center" gap={2}>
                          <BellIcon />
                          <Heading size={1}>Tasks & reminders</Heading>
                        </Flex>
                        {pendingTaskIds.length > 0 && (
                          <Inline space={2} style={{alignItems: 'center', display: 'flex'}}>
                            <Spinner size={1} />
                            <Text size={0} muted>
                              Saving reminder updates…
                            </Text>
                          </Inline>
                        )}
                      </Flex>
                      {selectedDateTasks.length === 0 ? (
                        <Text size={1} muted>No active reminders for this day.</Text>
                      ) : (
                        <Stack space={3}>
                          {selectedDateTasks.map((task) => {
                            const {variant, due, remind} = resolveTaskBadge(task)
                            const badgeStyles = TASK_BADGE_STYLES[variant]
                            const dueDate = due || parseDateSafe(task.booking?.scheduledAt || null)
                            const remindDate = remind
                            const isCompleted = variant === 'completed'
                            const isSaving = pendingTaskIds.includes(task._id)
                            return (
                              <Card
                                key={task._id}
                                padding={3}
                                radius={2}
                                shadow={1}
                                style={{
                                  background: isCompleted ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.8)',
                                  opacity: isCompleted ? 0.85 : 1,
                                }}
                              >
                                <Stack space={2}>
                                  <Flex align="center" justify="space-between">
                                    <Text size={1} weight="semibold">{task.title}</Text>
                                    <Tooltip
                                      portal
                                      content={
                                        <Box padding={2} style={{maxWidth: 220}}>
                                          <Text size={1}>{TASK_BADGE_DESCRIPTIONS[variant]}</Text>
                                        </Box>
                                      }
                                    >
                                      <Badge
                                        tone={badgeStyles.tone}
                                        style={{
                                          borderColor: badgeStyles.borderColor,
                                          background: badgeStyles.background,
                                          color: badgeStyles.textColor,
                                          textTransform: 'capitalize',
                                        }}
                                      >
                                        {badgeStyles.label}
                                      </Badge>
                                    </Tooltip>
                                  </Flex>
                                  {dueDate ? (
                                    <Text size={0} muted>
                                      Due {format(dueDate, 'MMM d, h:mm a')} · {formatDistanceToNow(dueDate, {addSuffix: true})}
                                    </Text>
                                  ) : (
                                    <Text size={0} muted>No due date set</Text>
                                  )}
                                  {remindDate && (
                                    <Text size={0} muted>
                                      Reminder {formatDistanceToNow(remindDate, {addSuffix: true})}
                                    </Text>
                                  )}
                                  {task.booking && (
                                    <Text size={0} muted>
                                      Linked booking: {getCustomerName(task.booking.customer)}
                                    </Text>
                                  )}
                                  <Inline space={2}>
                                    <Button
                                      text="Open task"
                                      mode="ghost"
                                      tone="primary"
                                      onClick={() => handleOpenTask(task)}
                                      disabled={isSaving}
                                    />
                                    {variant !== 'completed' && (
                                      <>
                                        <Button
                                          text="Mark complete"
                                          mode="ghost"
                                          onClick={() => handleCompleteTask(task)}
                                          disabled={isSaving}
                                          loading={isSaving}
                                        />
                                        <Button
                                          text="Snooze"
                                          mode="ghost"
                                          tone="default"
                                          onClick={() => handleSnoozeTask(task)}
                                          disabled={isSaving}
                                          loading={isSaving}
                                        />
                                      </>
                                    )}
                                  </Inline>
                                </Stack>
                              </Card>
                            )
                          })}
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                </Card>

                <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                  <Stack space={3}>
                    <Flex align="center" gap={2}>
                      <BellIcon />
                      <Heading size={1}>Upcoming reminders</Heading>
                    </Flex>
                    {upcomingTaskReminders.length === 0 ? (
                      <Text size={1} muted>No upcoming reminders.</Text>
                    ) : (
                      <Stack space={3}>
                        {upcomingTaskReminders.slice(0, 8).map(({task, due, remind}) => {
                          const {variant} = resolveTaskBadge(task)
                          const badgeStyles = TASK_BADGE_STYLES[variant]
                          const isSaving = pendingTaskIds.includes(task._id)
                          return (
                          <Card
                            key={`reminder-${task._id}`}
                            padding={3}
                            radius={2}
                            shadow={1}
                            style={{background: 'rgba(15,23,42,0.8)'}}
                          >
                            <Stack space={1}>
                              <Flex align="center" justify="space-between">
                                <Text size={1} weight="semibold">{task.title}</Text>
                                <Tooltip
                                  portal
                                  content={
                                    <Box padding={2} style={{maxWidth: 220}}>
                                      <Text size={1}>{TASK_BADGE_DESCRIPTIONS[variant]}</Text>
                                    </Box>
                                  }
                                >
                                  <Badge
                                    tone={badgeStyles.tone}
                                    style={{
                                      borderColor: badgeStyles.borderColor,
                                      background: badgeStyles.background,
                                      color: badgeStyles.textColor,
                                      textTransform: 'capitalize',
                                    }}
                                  >
                                    {badgeStyles.label}
                                  </Badge>
                                </Tooltip>
                              </Flex>
                              <Text size={0} muted>
                                {remind
                                  ? `Reminder ${formatDistanceToNow(remind, {addSuffix: true})}`
                                  : 'Reminder scheduled'}
                              </Text>
                              {due && (
                                <Text size={0} muted>
                                  Due {format(due, 'MMM d, h:mm a')}
                                </Text>
                              )}
                              <Inline space={2}>
                                <Button
                                  text="Open"
                                  mode="ghost"
                                  tone="primary"
                                  onClick={() => handleOpenTask(task)}
                                  disabled={isSaving}
                                />
                                <Button
                                  text="Complete"
                                  mode="ghost"
                                  onClick={() => handleCompleteTask(task)}
                                  disabled={isSaving}
                                  loading={isSaving}
                                />
                                {variant !== 'completed' && (
                                  <Button
                                    text="Snooze"
                                    mode="ghost"
                                    tone="default"
                                    onClick={() => handleSnoozeTask(task)}
                                    disabled={isSaving}
                                    loading={isSaving}
                                  />
                                )}
                              </Inline>
                            </Stack>
                          </Card>
                        )})}
                      </Stack>
                    )}
                  </Stack>
                </Card>

                <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent">
                  <Stack space={3}>
                    <Heading size={1}>Upcoming appointments</Heading>
                    {filteredUpcoming.length === 0 ? (
                      <Text size={1} muted>No appointments match the selected filter.</Text>
                    ) : (
                      <Stack space={3}>
                        {filteredUpcoming.slice(0, 15).map((event) => (
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
                                <Text size={0} muted>
                                  {event.scheduledAt
                                    ? formatDistanceToNow(parseISO(event.scheduledAt), {addSuffix: true})
                                    : ''}
                                </Text>
                              </Flex>
                              <Text size={1}>{getCustomerName(event.customer)}</Text>
                              {event.service && (
                                <Text size={0} muted>
                                  {event.service}
                                </Text>
                              )}
                              <Inline space={2}>
                                <Button text="Open" mode="ghost" tone="primary" onClick={() => handleOpenDocument(event)} />
                                <Button
                                  text="Focus day"
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
                    <Text size={0} muted>
                      Drop any appointment here to remove it from the calendar. Drag items from this list onto a
                      day to schedule them.
                    </Text>
                    {unscheduledBookings.length === 0 ? (
                      <Text size={1} muted>Nothing waiting. Create a new appointment to get started.</Text>
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
                              <Text size={1} weight="semibold">{getCustomerName(event.customer)}</Text>
                              {event.service && (
                                <Text size={0} muted>
                                  {event.service}
                                </Text>
                              )}
                              <Inline space={2}>
                                <Button text="Open" mode="ghost" tone="primary" onClick={() => handleOpenDocument(event)} />
                                <Button
                                  text="Schedule"
                                  mode="ghost"
                                  onClick={() => {
                                    const baseDate = new Date()
                                    setSelectedDate(baseDate)
                                    setCurrentMonth(startOfMonth(baseDate))
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
