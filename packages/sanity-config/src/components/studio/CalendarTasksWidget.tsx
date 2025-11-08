import React, {useCallback, useEffect, useMemo, useState} from 'react'
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
import {BellIcon} from '@sanity/icons'
import {format, formatDistanceToNow} from 'date-fns'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

type BookingCustomer = {
  _id?: string
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}

type CalendarBooking = {
  documentId: string
  draftId?: string
  publishedId?: string
  bookingId: string | null
  service: string | null
  scheduledAt: string | null
  status: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
  customer: BookingCustomer | null
}

type CalendarTask = {
  _id: string
  title: string
  status: string
  dueAt: string | null
  remindAt: string | null
  notes: string | null
  booking: CalendarBooking | null
  assignedTo: BookingCustomer | null
}

type BadgeVariant =
  | 'caution'
  | 'critical'
  | 'positive'
  | 'default'
  | 'neutral'
  | 'primary'
  | 'suggest'

const TASK_BADGE_DESCRIPTIONS: Record<BadgeVariant, string> = {
  critical: 'Overdue reminder',
  caution: 'Due soon',
  primary: 'Due today',
  suggest: 'Upcoming reminder',
  neutral: 'Upcoming reminder',
  default: 'On your radar',
  positive: 'Ready to go',
}

const TASK_BADGE_STYLES: Record<
  BadgeVariant,
  {tone: BadgeVariant; borderColor: string; background: string; textColor: string; label: string}
> = {
  critical: {
    tone: 'critical',
    borderColor: '#dc2626',
    background: '#fee2e2',
    textColor: '#7f1d1d',
    label: 'Overdue',
  },
  caution: {
    tone: 'caution',
    borderColor: '#f97316',
    background: '#fff7ed',
    textColor: '#7c2d12',
    label: 'Due soon',
  },
  primary: {
    tone: 'primary',
    borderColor: '#2563eb',
    background: '#dbeafe',
    textColor: '#1d4ed8',
    label: 'Due today',
  },
  suggest: {
    tone: 'suggest',
    borderColor: '#0f766e',
    background: '#ccfbf1',
    textColor: '#115e59',
    label: 'Reminder',
  },
  neutral: {
    tone: 'neutral',
    borderColor: '#94a3b8',
    background: '#f8fafc',
    textColor: '#475569',
    label: 'Upcoming',
  },
  default: {
    tone: 'default',
    borderColor: '#e5e7eb',
    background: '#ffffff',
    textColor: '#111827',
    label: 'Pending',
  },
  positive: {
    tone: 'positive',
    borderColor: '#15803d',
    background: '#dcfce7',
    textColor: '#166534',
    label: 'Ready',
  },
}

const computeSnoozedReminder = (task: CalendarTask): Date => {
  const base = task.remindAt
    ? new Date(task.remindAt)
    : task.dueAt
      ? new Date(task.dueAt)
      : new Date()
  const nextReminder = new Date(Math.max(Date.now(), base.getTime()))
  nextReminder.setMinutes(nextReminder.getMinutes() + 15)
  return nextReminder
}

const formatDateForStorage = (value: Date): string => value.toISOString()

const deriveBookingStatusFromTaskAction = (
  action: 'complete' | 'snooze',
  current?: string | null,
) => {
  if (action === 'complete') return 'completed'
  if (action === 'snooze') return current && current !== 'pending' ? 'pending' : current
  return current
}

const resolveTaskBadge = (task: CalendarTask) => {
  const due = task.dueAt ? new Date(task.dueAt) : null
  const remind = task.remindAt ? new Date(task.remindAt) : null
  const now = new Date()
  const getDiff = (date: Date | null) =>
    date ? date.getTime() - now.getTime() : Number.POSITIVE_INFINITY

  if ((due && due < now) || (remind && remind < now)) {
    return {due, remind, variant: 'critical' as BadgeVariant}
  }
  if (due && getDiff(due) <= 2 * 60 * 60 * 1000) {
    return {due, remind, variant: 'caution' as BadgeVariant}
  }
  if (remind && getDiff(remind) <= 2 * 60 * 60 * 1000) {
    return {due, remind, variant: 'suggest' as BadgeVariant}
  }
  if (due && getDiff(due) <= 24 * 60 * 60 * 1000) {
    return {due, remind, variant: 'primary' as BadgeVariant}
  }
  if (!due && !remind) {
    return {due, remind, variant: 'default' as BadgeVariant}
  }
  return {due, remind, variant: 'neutral' as BadgeVariant}
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 150): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (error) {
      attempt += 1
      if (attempt >= retries) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, delay * attempt))
    }
  }
}

const CUSTOMER_PROJECTION = `{
  _id,
  firstName,
  lastName,
  name,
  email,
  phone
}`

const TASK_WIDGET_QUERY = `*[_type == "calendarTask"] | order(coalesce(remindAt, dueAt, dateTime("9999-12-31T23:59:59Z")) asc, coalesce(dueAt, remindAt, dateTime("9999-12-31T23:59:59Z")) asc) {
  _id,
  title,
  status,
  dueAt,
  remindAt,
  booking->{
    _id,
    scheduledAt,
    status,
    customer->${CUSTOMER_PROJECTION}
  },
  assignedTo->${CUSTOMER_PROJECTION}
}`

const TASK_WIDGET_LISTEN_QUERY = '*[_type == "calendarTask"]'

type BookingResult = {
  _id: string
  scheduledAt?: string | null
  status?: string | null
  customer?: BookingCustomer | null
}

type TaskResult = {
  _id: string
  title?: string | null
  status?: string | null
  dueAt?: string | null
  remindAt?: string | null
  booking?: BookingResult | null
  assignedTo?: BookingCustomer | null
}

function getDisplayName(customer?: BookingCustomer | null) {
  if (!customer) return 'Unassigned'
  const first = customer.firstName?.trim()
  const last = customer.lastName?.trim()
  if (first || last) return [first, last].filter(Boolean).join(' ')
  if (customer.name?.trim()) return customer.name.trim()
  if (customer.email?.trim()) return customer.email.trim()
  if (customer.phone?.trim()) return customer.phone.trim()
  return 'Unassigned'
}

function normalizeBooking(record?: BookingResult | null): CalendarBooking | null {
  if (!record) return null
  const rawId = record._id
  const isDraft = rawId?.startsWith('drafts.')
  const baseId = isDraft ? rawId.substring(7) : rawId
  return {
    documentId: baseId,
    draftId: isDraft ? rawId : undefined,
    publishedId: isDraft ? baseId : rawId,
    bookingId: null,
    service: null,
    scheduledAt: record.scheduledAt ?? null,
    status: record.status ?? null,
    notes: null,
    createdAt: null,
    updatedAt: null,
    customer: record.customer ?? null,
  }
}

function normalizeTask(record: TaskResult): CalendarTask {
  return {
    _id: record._id,
    title: record.title?.trim() || 'Calendar task',
    status: record.status || 'pending',
    dueAt: record.dueAt ?? null,
    remindAt: record.remindAt ?? null,
    notes: null,
    booking: normalizeBooking(record.booking),
    assignedTo: record.assignedTo ?? null,
  }
}

const CalendarTasksWidget: React.FC = () => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const {push: pushToast} = useToast()
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([])

  const addPendingTask = useCallback((id: string) => {
    setPendingTaskIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const removePendingTask = useCallback((id: string) => {
    setPendingTaskIds((prev) => prev.filter((item) => item !== id))
  }, [])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const records = await client.fetch<TaskResult[]>(
        TASK_WIDGET_QUERY,
        {},
        {perspective: 'drafts'},
      )
      setTasks(records.map(normalizeTask))
    } catch (err) {
      console.error('Failed to load calendar tasks', err)
      setError(err instanceof Error ? err.message : 'Unable to load tasks')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    const subscription = client
      .listen(TASK_WIDGET_LISTEN_QUERY, {}, {visibility: 'query', tag: 'calendar-tasks-widget'})
      .subscribe(() => {
        loadTasks()
      })

    return () => subscription.unsubscribe()
  }, [client, loadTasks])

  const actionableTasks = useMemo(() => {
    return tasks
      .filter((task) => task.status !== 'completed')
      .map((task) => {
        const result = resolveTaskBadge(task)
        const sortValue =
          result.remind?.getTime() ?? result.due?.getTime() ?? Number.MAX_SAFE_INTEGER
        return {...result, sortValue, task}
      })
      .sort((a, b) => a.sortValue - b.sortValue)
  }, [tasks])

  const handleOpenTask = useCallback(
    (task: CalendarTask) => {
      router.navigateIntent('edit', {id: task._id, type: 'calendarTask'})
    },
    [router],
  )

  const syncBookingStatus = useCallback(
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

          return transaction.commit({tag: 'calendar-widget-booking-sync'})
        })

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
        console.error('Failed to sync booking status for widget task', err)
        pushToast({
          status: 'warning',
          title: 'Booking status update failed',
          description:
            err instanceof Error
              ? err.message
              : 'Unable to reflect the reminder update on the booking.',
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
            .commit({tag: 'calendar-widget-complete'}),
        )

        const updatedTask: CalendarTask = {...task, status: 'completed'}

        setTasks((prev) => prev.map((item) => (item._id === task._id ? updatedTask : item)))

        await syncBookingStatus('complete', updatedTask)

        pushToast({
          status: 'success',
          title: 'Task completed',
          description: `Marked "${task.title}" as done.`,
        })
      } catch (err) {
        console.error('Failed to complete calendar task', err)
        pushToast({
          status: 'error',
          title: 'Unable to complete task',
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        })
      } finally {
        removePendingTask(task._id)
      }
    },
    [addPendingTask, client, pushToast, removePendingTask, syncBookingStatus],
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
            .commit({tag: 'calendar-widget-snooze'}),
        )

        setTasks((prev) =>
          prev.map((item) => (item._id === task._id ? {...item, remindAt: nextReminderIso} : item)),
        )

        await syncBookingStatus('snooze', task)

        pushToast({
          status: 'success',
          title: 'Reminder snoozed',
          description: `We will remind you ${format(nextReminder, 'MMM d, h:mm a')}.`,
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
    [addPendingTask, client, pushToast, removePendingTask, syncBookingStatus],
  )

  const handleOpenCalendar = useCallback(() => {
    router.navigateUrl({path: '/desk/calendar-app'})
  }, [router])

  const hasPending = pendingTaskIds.length > 0

  return (
    <Card padding={4} radius={3} shadow={1} tone="transparent">
      <Stack space={3}>
        <Flex align={['flex-start', 'center']} justify="space-between" gap={3} wrap="wrap">
          <Flex align="center" gap={3}>
            <BellIcon />
            <Heading size={1}>Calendar reminders</Heading>
          </Flex>
          {hasPending && (
            <Inline space={2} style={{alignItems: 'center', display: 'flex'}}>
              <Spinner size={1} />
              <Text size={0} muted>
                Saving reminder updates…
              </Text>
            </Inline>
          )}
        </Flex>

        {loading && (
          <Flex align="center" gap={3}>
            <Spinner />
            <Text size={1}>Loading reminders…</Text>
          </Flex>
        )}

        {error && (
          <Text size={1} style={{color: '#ef4444'}}>
            {error}
          </Text>
        )}

        {!loading && !error && actionableTasks.length === 0 && (
          <Text size={1} muted>
            No pending reminders. Great job staying on top of things!
          </Text>
        )}

        {!loading && !error && actionableTasks.length > 0 && (
          <Stack space={3}>
            {actionableTasks.slice(0, 6).map(({task, due, remind, variant}) => {
              const badgeStyles = TASK_BADGE_STYLES[variant]
              const isSaving = pendingTaskIds.includes(task._id)
              return (
                <Card
                  key={task._id}
                  padding={3}
                  radius={2}
                  shadow={1}
                  tone="transparent"
                  style={{background: 'rgba(15,23,42,0.85)'}}
                >
                  <Stack space={2}>
                    <Flex align="center" justify="space-between">
                      <Text size={1} weight="semibold">
                        {task.title || 'Calendar task'}
                      </Text>
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
                      Assigned to {getDisplayName(task.assignedTo)}
                    </Text>
                    {due && (
                      <Text size={0} muted>
                        Due {format(due, 'MMM d, h:mm a')} ·{' '}
                        {formatDistanceToNow(due, {addSuffix: true})}
                      </Text>
                    )}
                    {remind && (
                      <Text size={0} muted>
                        Reminder {formatDistanceToNow(remind, {addSuffix: true})}
                      </Text>
                    )}
                    {task.booking && (
                      <Text size={0} muted>
                        Booking: {getDisplayName(task.booking.customer)}
                      </Text>
                    )}
                    <Inline space={2}>
                      <Button
                        text="Open"
                        tone="primary"
                        mode="ghost"
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
                      <Button
                        text="Snooze"
                        mode="ghost"
                        tone="default"
                        onClick={() => handleSnoozeTask(task)}
                        disabled={isSaving}
                        loading={isSaving}
                      />
                      <Button
                        text="Open calendar"
                        mode="ghost"
                        onClick={handleOpenCalendar}
                        disabled={isSaving}
                      />
                    </Inline>
                  </Stack>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

export default CalendarTasksWidget
