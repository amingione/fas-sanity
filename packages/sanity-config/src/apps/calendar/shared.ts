import {addMinutes, format, isBefore, parseISO} from 'date-fns'

export type BookingCustomer = {
  _id?: string | null
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}

export type CalendarBooking = {
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

export type CalendarTask = {
  _id: string
  title: string
  status: string
  dueAt?: string | null
  remindAt?: string | null
  notes?: string | null
  booking?: CalendarBooking | null
  assignedTo?: BookingCustomer | null
}

export const TASK_SNOOZE_MINUTES = 60

export const DATE_STORAGE_FORMAT = "yyyy-MM-dd'T'HH:mm:ssxxx"

export const TASK_BADGE_STYLES = {
  overdue: {
    tone: 'critical' as const,
    label: 'Overdue',
    background: 'rgba(248,113,113,0.16)',
    borderColor: 'rgba(248,113,113,0.45)',
    textColor: '#fca5a5',
  },
  upcoming: {
    tone: 'caution' as const,
    label: 'Upcoming',
    background: 'rgba(252,211,77,0.18)',
    borderColor: 'rgba(251,191,36,0.45)',
    textColor: '#fbbf24',
  },
  scheduled: {
    tone: 'primary' as const,
    label: 'Scheduled',
    background: 'rgba(96,165,250,0.18)',
    borderColor: 'rgba(96,165,250,0.45)',
    textColor: '#bfdbfe',
  },
  completed: {
    tone: 'positive' as const,
    label: 'Completed',
    background: 'rgba(34,197,94,0.18)',
    borderColor: 'rgba(74,222,128,0.45)',
    textColor: '#86efac',
  },
}

export const TASK_BADGE_DESCRIPTIONS: Record<TaskBadgeVariant, string> = {
  overdue: 'This reminder is overdue and needs attention right away.',
  upcoming: 'Scheduled soon — happening within the next day.',
  scheduled: 'Scheduled with plenty of time before it is due.',
  completed: 'Completed and no further action is needed.',
}

export type TaskBadgeVariant = keyof typeof TASK_BADGE_STYLES

export const BOOKING_COMPLETED_STATUSES = new Set(['completed', 'cancelled', 'no-show'])

export function parseDateSafe(value?: string | null) {
  if (!value) return null
  try {
    return parseISO(value)
  } catch (err) {
    console.warn('Failed to parse date value', value, err)
    return null
  }
}

export function formatDateForStorage(date: Date) {
  return format(date, DATE_STORAGE_FORMAT)
}

export function isoTimesEqual(a?: string | null, b?: string | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  const parsedA = parseDateSafe(a)
  const parsedB = parseDateSafe(b)
  if (!parsedA || !parsedB) return a === b
  return parsedA.getTime() === parsedB.getTime()
}

export function computeTaskTiming(booking: CalendarBooking, overrideDate?: Date | null) {
  const baseDate =
    overrideDate || parseDateSafe(booking.scheduledAt) || parseDateSafe(booking.createdAt) || new Date()

  const dueAtIso = formatDateForStorage(baseDate)

  let remindDate = new Date(baseDate.getTime() - 1000 * 60 * 60)
  const now = new Date()
  if (remindDate < now) {
    remindDate = now
  }

  const remindAtIso = formatDateForStorage(remindDate)

  return {dueAtIso, remindAtIso}
}

export function resolveTaskBadge(task: CalendarTask): {
  variant: TaskBadgeVariant
  due: Date | null
  remind: Date | null
} {
  const due = parseDateSafe(task.dueAt || task.booking?.scheduledAt || null)
  const remind = parseDateSafe(task.remindAt)
  const now = new Date()

  if (task.status === 'completed') {
    return {variant: 'completed', due, remind}
  }

  if (due && isBefore(due, now)) {
    return {variant: 'overdue', due, remind}
  }

  if (remind && !isBefore(remind, now) && remind.getTime() - now.getTime() <= 1000 * 60 * 60 * 24) {
    return {variant: 'upcoming', due, remind}
  }

  if (due && due.getTime() - now.getTime() <= 1000 * 60 * 60 * 24) {
    return {variant: 'upcoming', due, remind}
  }

  return {variant: 'scheduled', due, remind}
}

export function summarizeTaskBadges(tasksForDay: CalendarTask[]) {
  let variant: TaskBadgeVariant | null = null

  tasksForDay.forEach((task) => {
    const {variant: currentVariant} = resolveTaskBadge(task)
    if (currentVariant === 'overdue') {
      variant = 'overdue'
    } else if (currentVariant === 'upcoming' && variant !== 'overdue') {
      variant = 'upcoming'
    } else if (currentVariant === 'completed' && !variant) {
      variant = 'completed'
    } else if (!variant) {
      variant = currentVariant
    }
  })

  return variant
}

export function computeSnoozedReminder(
  task: Pick<CalendarTask, 'dueAt' | 'remindAt' | 'booking' | 'status'>,
  options?: {now?: Date; snoozeMinutes?: number},
) {
  const now = options?.now ?? new Date()
  const snoozeMinutes = options?.snoozeMinutes ?? TASK_SNOOZE_MINUTES
  const {due, remind} = resolveTaskBadge({
    ...task,
    _id: 'temp',
    title: '',
    status: task.status ?? 'pending',
    notes: undefined,
  } as CalendarTask)

  const effectiveBase = remind && !isBefore(remind, now) ? remind : now
  let nextReminder = addMinutes(effectiveBase, snoozeMinutes)

  if (due && isBefore(due, nextReminder)) {
    nextReminder = new Date(Math.max(due.getTime(), now.getTime()))
  }

  return nextReminder
}

export function deriveBookingStatusFromTaskAction(
  action: 'complete' | 'snooze',
  currentStatus?: string | null,
) {
  if (action === 'complete') {
    return 'completed'
  }

  if (action === 'snooze') {
    if (currentStatus && BOOKING_COMPLETED_STATUSES.has(currentStatus)) {
      return currentStatus
    }
    return 'snoozed'
  }

  return currentStatus ?? 'confirmed'
}

export type TaskSyncPlan = {
  shouldCreate: boolean
  setPayload: Record<string, unknown>
  unsetPayload: string[]
  statusChange: 'complete' | 'reopen' | null
  dueAtIso: string
  remindAtIso: string
  assignedRef?: {_type: 'reference'; _ref: string}
}

export function computeTaskSyncPlan(
  booking: CalendarBooking,
  existingTask?: CalendarTask | null,
): TaskSyncPlan {
  const scheduledDate = parseDateSafe(booking.scheduledAt)
  const {dueAtIso, remindAtIso} = computeTaskTiming(booking, scheduledDate)
  const assignedRef = booking.customer?._id
    ? ({
        _type: 'reference' as const,
        _ref: booking.customer._id,
      } as const)
    : undefined

  if (!existingTask) {
    return {
      shouldCreate: true,
      setPayload: {
        dueAt: dueAtIso,
        remindAt: remindAtIso,
        notes: booking.notes || undefined,
        status: 'pending',
      },
      unsetPayload: [],
      statusChange: null,
      dueAtIso,
      remindAtIso,
      assignedRef,
    }
  }

  const setPayload: Record<string, unknown> = {}
  const unsetPayload: string[] = []

  if (!isoTimesEqual(existingTask.dueAt ?? null, dueAtIso)) {
    setPayload.dueAt = dueAtIso
  }

  if (!isoTimesEqual(existingTask.remindAt ?? null, remindAtIso)) {
    setPayload.remindAt = remindAtIso
  }

  if (assignedRef) {
    if (existingTask.assignedTo?._id !== assignedRef._ref) {
      setPayload.assignedTo = assignedRef
    }
  } else if (existingTask.assignedTo?._id) {
    unsetPayload.push('assignedTo')
  }

  if (booking.notes && booking.notes !== existingTask.notes) {
    setPayload.notes = booking.notes
  } else if (!booking.notes && existingTask.notes) {
    unsetPayload.push('notes')
  }

  const shouldComplete = booking.status ? BOOKING_COMPLETED_STATUSES.has(booking.status) : false
  let statusChange: 'complete' | 'reopen' | null = null

  if (shouldComplete && existingTask.status !== 'completed') {
    setPayload.status = 'completed'
    statusChange = 'complete'
  } else if (!shouldComplete && existingTask.status === 'completed') {
    setPayload.status = 'pending'
    statusChange = 'reopen'
  }

  return {
    shouldCreate: false,
    setPayload,
    unsetPayload,
    statusChange,
    dueAtIso,
    remindAtIso,
    assignedRef,
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {attempts?: number; delayMs?: number} = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const delayMs = options.delayMs ?? 500
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
      }
    }
  }

  throw lastError
}
