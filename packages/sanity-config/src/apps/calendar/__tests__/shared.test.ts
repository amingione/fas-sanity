import {describe, expect, it} from 'vitest'
import {
  CalendarBooking,
  CalendarTask,
  computeSnoozedReminder,
  computeTaskSyncPlan,
  deriveBookingStatusFromTaskAction,
  formatDateForStorage,
  parseDateSafe,
  TASK_SNOOZE_MINUTES,
} from '../shared'

describe('calendar shared utilities', () => {
  it('plans task creation with aligned due and reminder dates', () => {
    const scheduled = formatDateForStorage(new Date(Date.now() + 2 * 60 * 60 * 1000))
    const booking: CalendarBooking = {
      documentId: 'booking-1',
      bookingId: null,
      service: null,
      scheduledAt: scheduled,
      status: 'confirmed',
      notes: null,
      createdAt: null,
      updatedAt: null,
      customer: null,
    }

    const plan = computeTaskSyncPlan(booking, null)

    expect(plan.shouldCreate).toBe(true)
    const due = parseDateSafe(plan.dueAtIso)
    const remind = parseDateSafe(plan.remindAtIso)

    expect(due?.toISOString()).toEqual(parseDateSafe(scheduled)?.toISOString())
    expect(remind && due ? remind.getTime() <= due.getTime() : false).toBe(true)
  })

  it('flags existing tasks for completion sync when bookings are completed', () => {
    const now = new Date()
    const scheduled = formatDateForStorage(new Date(now.getTime() + 45 * 60 * 1000))
    const booking: CalendarBooking = {
      documentId: 'booking-2',
      bookingId: null,
      service: null,
      scheduledAt: scheduled,
      status: 'completed',
      notes: null,
      createdAt: null,
      updatedAt: null,
      customer: null,
    }

    const existingTask: CalendarTask = {
      _id: 'task-1',
      title: 'Follow up',
      status: 'pending',
      dueAt: formatDateForStorage(now),
      remindAt: formatDateForStorage(now),
      notes: null,
      booking,
      assignedTo: null,
    }

    const plan = computeTaskSyncPlan(booking, existingTask)

    expect(plan.shouldCreate).toBe(false)
    expect(plan.statusChange).toBe('complete')
    expect(plan.setPayload.status).toBe('completed')
  })

  it('computes snoozed reminders without exceeding due time', () => {
    const now = new Date()
    const due = new Date(now.getTime() + 30 * 60 * 1000)
    const remind = new Date(now.getTime() + 10 * 60 * 1000)

    const task: CalendarTask = {
      _id: 'task-2',
      title: 'Reminder',
      status: 'pending',
      dueAt: formatDateForStorage(due),
      remindAt: formatDateForStorage(remind),
      notes: null,
      booking: null,
      assignedTo: null,
    }

    const next = computeSnoozedReminder(task, {now, snoozeMinutes: TASK_SNOOZE_MINUTES})

    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime())
    expect(next.getTime()).toBeLessThanOrEqual(due.getTime())
  })

  it('derives booking statuses for dashboard quick actions', () => {
    expect(deriveBookingStatusFromTaskAction('complete', 'confirmed')).toBe('completed')
    expect(deriveBookingStatusFromTaskAction('snooze', 'confirmed')).toBe('snoozed')
    expect(deriveBookingStatusFromTaskAction('snooze', 'cancelled')).toBe('cancelled')
  })
})
