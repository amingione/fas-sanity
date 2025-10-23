import React, {useEffect, useMemo, useState} from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Inline,
  Stack,
  Text,
  Tooltip
} from '@sanity/ui'
import {
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
  subMonths
} from 'date-fns'
import {readStudioEnv} from './studioEnv'

interface CalComAttendee {
  name?: string
  email?: string
}

interface CalComBooking {
  id: number
  uid: string
  title?: string
  startTime: string
  endTime: string
  start_time?: string
  end_time?: string
  attendees?: CalComAttendee[]
  location?: string
  description?: string | null
  eventType?: {
    slug?: string
    title?: string
  }
}

interface Booking extends CalComBooking {
  dateKey: string
}

type DayCell = {
  date: Date
  label: string
  dateKey: string
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  hasBookings: boolean
}

const safeEnv = (key: string): string | undefined => readStudioEnv(key)

const CAL_API_BASE =
  safeEnv('SANITY_STUDIO_CALCOM_API_BASE_URL') ||
  safeEnv('VITE_CALCOM_API_BASE_URL') ||
  'https://api.cal.com/v1'

const CAL_API_KEY =
  safeEnv('SANITY_STUDIO_CALCOM_API_KEY') || safeEnv('VITE_CALCOM_API_KEY')

const CAL_BOOKING_URL =
  safeEnv('SANITY_STUDIO_CALCOM_BOOKING_URL') || safeEnv('VITE_CALCOM_BOOKING_URL')

const CAL_EMBED_URL =
  safeEnv('SANITY_STUDIO_CALCOM_EMBED_URL') || safeEnv('VITE_CALCOM_EMBED_URL')

function getPrimaryAttendeeName(attendees?: CalComAttendee[]): string {
  if (!attendees || attendees.length === 0) return 'Unnamed attendee'
  return attendees[0]?.name || attendees[0]?.email || 'Unnamed attendee'
}

function formatDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function buildDays(
  currentMonth: Date,
  selectedDate: Date,
  bookingsByDate: Map<string, Booking[]>
): DayCell[] {
  const start = startOfWeek(startOfMonth(currentMonth), {weekStartsOn: 1})
  const end = endOfWeek(endOfMonth(currentMonth), {weekStartsOn: 1})
  return eachDayOfInterval({start, end}).map((date) => {
    const dateKey = formatDateKey(date)
    const label = format(date, 'd')
    const isCurrent = isSameMonth(date, currentMonth)
    const selected = isSameDay(date, selectedDate)
    return {
      date,
      dateKey,
      label,
      isCurrentMonth: isCurrent,
      isToday: isToday(date),
      isSelected: selected,
      hasBookings: bookingsByDate.has(dateKey)
    }
  })
}

const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const emptyBookings: Booking[] = []

export default function BookingCalendar() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  useEffect(() => {
    if (!CAL_API_KEY) {
      setError('Provide a Cal.com API key via SANITY_STUDIO_CALCOM_API_KEY to load bookings.')
      return
    }

    const controller = new AbortController()

    async function fetchBookings() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          status: 'ACCEPTED',
          sort: 'startTime'
        })
        const response = await fetch(`${CAL_API_BASE}/bookings?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${CAL_API_KEY}`,
            Accept: 'application/json'
          },
          signal: controller.signal
        })

        if (!response.ok) {
          const detail = await response.text()
          throw new Error(detail || `Cal.com request failed (${response.status})`)
        }

        const payload = await response.json()
        const data: CalComBooking[] = Array.isArray(payload?.data) ? payload.data : []

        const mapped: Booking[] = data
          .map((booking) => {
            const startTime = booking.startTime || booking['start_time']
            if (!startTime) return null
            const startDate = parseISO(startTime)
            return {
              ...booking,
              startTime,
              endTime: booking.endTime || booking['end_time'] || startTime,
              dateKey: formatDateKey(startDate)
            }
          })
          .filter(Boolean) as Booking[]

        setBookings(mapped)
      } catch (err: any) {
        if (err.name === 'AbortError') return
        console.error('Failed to load Cal.com bookings', err)
        setError(err.message || 'Failed to load Cal.com bookings')
      } finally {
        setLoading(false)
      }
    }

    fetchBookings()

    return () => controller.abort()
  }, [])

  const bookingsByDate = useMemo(() => {
    const grouped = new Map<string, Booking[]>()
    bookings.forEach((booking) => {
      const list = grouped.get(booking.dateKey) || []
      list.push(booking)
      grouped.set(booking.dateKey, list)
    })

    // Keep day lists sorted chronologically so time ordering is consistent
    grouped.forEach((list, key) => {
      list.sort((a, b) => (isBefore(parseISO(a.startTime), parseISO(b.startTime)) ? -1 : 1))
      grouped.set(key, list)
    })
    return grouped
  }, [bookings])

  const days = useMemo(
    () => buildDays(currentMonth, selectedDate, bookingsByDate),
    [bookingsByDate, currentMonth, selectedDate]
  )

  const selectedBookings = useMemo(() => {
    if (!selectedDate) return emptyBookings
    const key = formatDateKey(selectedDate)
    return bookingsByDate.get(key) || emptyBookings
  }, [bookingsByDate, selectedDate])

  const upcomingBookings = useMemo(() => {
    const now = new Date()
    return bookings
      .filter((booking) => !isBefore(parseISO(booking.startTime), now))
      .sort((a, b) => (isBefore(parseISO(a.startTime), parseISO(b.startTime)) ? -1 : 1))
      .slice(0, 25)
  }, [bookings])

  const currentMonthLabel = format(currentMonth, 'MMMM yyyy')

  return (
    <Card padding={4} radius={3} shadow={1} style={{background: '#0d1117'}}>
      <Stack space={4}>
        <Heading size={2} style={{color: '#fff'}}>
          📅 Cal.com Bookings
        </Heading>

        {loading && (
          <Text size={1} style={{color: '#9ca3af'}}>
            Loading bookings…
          </Text>
        )}

        {error && (
          <Card padding={3} radius={2} tone="caution">
            <Text size={1}>{error}</Text>
          </Card>
        )}

        <Flex gap={4} direction={['column', 'column', 'row']}>
          <Box flex={2}>
            <Stack space={3}>
              <Flex align="center" justify="space-between">
                <Inline space={2}>
                  <Button
                    mode="bleed"
                    text="Prev"
                    onClick={() => {
                      const next = subMonths(currentMonth, 1)
                      setCurrentMonth(next)
                      setSelectedDate((prev) => (isSameMonth(prev, next) ? prev : next))
                    }}
                    tone="default"
                  />
                  <Button
                    mode="bleed"
                    text="Today"
                    onClick={() => {
                      const today = new Date()
                      setCurrentMonth(startOfMonth(today))
                      setSelectedDate(today)
                    }}
                    tone="default"
                  />
                </Inline>
                <Text weight="semibold" style={{color: '#fff'}}>
                  {currentMonthLabel}
                </Text>
                <Button
                  mode="bleed"
                  text="Next"
                  onClick={() => {
                    const next = addMonths(currentMonth, 1)
                    setCurrentMonth(next)
                    setSelectedDate((prev) => (isSameMonth(prev, next) ? prev : next))
                  }}
                  tone="default"
                />
              </Flex>

              <GridHeader />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: '0.35rem',
                  background: 'rgba(255,255,255,0.08)',
                  padding: 6,
                  borderRadius: 12
                }}
              >
                {days.map((day) => (
                  <Tooltip
                    key={day.dateKey}
                    content={
                      day.hasBookings
                        ? `${bookingsByDate.get(day.dateKey)?.length || 0} booking(s)`
                        : undefined
                    }
                    placement="top"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDate(day.date)}
                      style={{
                        appearance: 'none',
                        border: 'none',
                        borderRadius: 8,
                        padding: '0.45rem 0.25rem',
                        cursor: 'pointer',
                        background: day.isSelected
                          ? '#f9fafb'
                          : day.isCurrentMonth
                          ? 'rgba(255,255,255,0.05)'
                          : 'transparent',
                        color: day.isSelected
                          ? '#111827'
                          : day.isCurrentMonth
                          ? '#f3f4f6'
                          : 'rgba(255,255,255,0.35)',
                        fontWeight: day.isToday ? 600 : 400,
                        position: 'relative'
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: '999px',
                          background: day.isSelected
                            ? day.isToday
                              ? '#4f46e5'
                              : '#fff'
                            : 'transparent',
                          color: day.isSelected
                            ? day.isToday
                              ? '#fff'
                              : '#111827'
                            : undefined
                        }}
                      >
                        {day.label}
                      </span>
                      {day.hasBookings && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 6,
                            right: 10,
                            width: 6,
                            height: 6,
                            borderRadius: '999px',
                            background: '#22d3ee'
                          }}
                        />
                      )}
                    </button>
                  </Tooltip>
                ))}
              </div>

              <Card padding={3} radius={2} shadow={1} style={{background: 'rgba(15,23,42,0.6)'}}>
                <Stack space={3}>
                  <Heading size={1} style={{color: '#f9fafb'}}>
                    {format(selectedDate, 'MMMM do, yyyy')}
                  </Heading>
                  {selectedBookings.length === 0 && (
                    <Text size={1} style={{color: '#94a3b8'}}>
                      No bookings for this day.
                    </Text>
                  )}
                  {selectedBookings.map((booking) => (
                    <Card key={booking.id} padding={3} radius={2} shadow={1} style={{background: '#0f172a'}}>
                      <Stack space={2}>
                        <Text size={1} weight="semibold" style={{color: '#e0f2fe'}}>
                          {getPrimaryAttendeeName(booking.attendees)}
                        </Text>
                        <Text size={1} style={{color: '#94a3b8'}}>
                          {format(parseISO(booking.startTime), 'h:mm a')} –{' '}
                          {format(parseISO(booking.endTime), 'h:mm a')}
                        </Text>
                        {booking.location && (
                          <Text size={1} style={{color: '#cbd5f5'}}>
                            📍 {booking.location}
                          </Text>
                        )}
                        {(booking.eventType?.title || booking.title) && (
                          <Text size={1} style={{color: '#94a3b8'}}>
                            {booking.eventType?.title || booking.title}
                          </Text>
                        )}
                        {CAL_BOOKING_URL && (
                          <Button
                            tone="primary"
                            text="View booking"
                            as="a"
                            href={`${CAL_BOOKING_URL.replace(/\/$/, '')}/${booking.uid}`}
                            target="_blank"
                          />
                        )}
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </Card>
            </Stack>
          </Box>

          <Box flex={1}>
            <Stack space={4}>
              {CAL_EMBED_URL ? (
                <Stack space={3}>
                  <Heading size={1} style={{color: '#f9fafb'}}>
                    Schedule an appointment
                  </Heading>
                  <Card
                    padding={0}
                    radius={2}
                    shadow={1}
                    style={{background: '#0f172a', minHeight: 420, overflow: 'hidden'}}
                  >
                    <iframe
                      src={CAL_EMBED_URL}
                      title="Cal.com Scheduling"
                      style={{
                        border: 'none',
                        width: '100%',
                        height: '100%',
                        minHeight: 420
                      }}
                      allow="camera; microphone; fullscreen; clipboard-read; clipboard-write"
                    />
                  </Card>
                </Stack>
              ) : (
                <Card padding={3} radius={2} tone="caution" shadow={1}>
                  <Stack space={3}>
                    <Heading size={1} style={{color: '#f59e0b'}}>
                      Scheduling embed not configured
                    </Heading>
                    <Text size={1} style={{color: '#1f2937'}}>
                      Set `SANITY_STUDIO_CALCOM_EMBED_URL` (or `VITE_CALCOM_EMBED_URL`) to display the Cal.com
                      scheduler here.
                    </Text>
                  </Stack>
                </Card>
              )}

              <Card padding={3} radius={2} shadow={1} style={{background: '#111827'}}>
                <Stack space={3}>
                  <Heading size={1} style={{color: '#f9fafb'}}>
                    Upcoming bookings
                  </Heading>
                  {upcomingBookings.length === 0 && !loading ? (
                    <Text size={1} style={{color: '#94a3b8'}}>
                      Nothing booked yet. Encourage clients to grab a spot!
                    </Text>
                  ) : (
                    <Stack space={2}>
                      {upcomingBookings.map((booking) => (
                        <Card key={booking.id} padding={3} radius={2} shadow={1} style={{background: '#0f172a'}}>
                          <Stack space={2}>
                            <Flex align="center" justify="space-between">
                              <Text size={1} weight="semibold" style={{color: '#e0f2fe'}}>
                                {getPrimaryAttendeeName(booking.attendees)}
                              </Text>
                              <Text size={1} style={{color: '#94a3b8'}}>
                                {format(parseISO(booking.startTime), 'MMM d')}
                              </Text>
                            </Flex>
                            <Text size={1} style={{color: '#cbd5f5'}}>
                              {format(parseISO(booking.startTime), 'h:mm a')} –{' '}
                              {format(parseISO(booking.endTime), 'h:mm a')}
                            </Text>
                            {booking.location && (
                              <Text size={1} style={{color: '#94a3b8'}}>
                                📍 {booking.location}
                              </Text>
                            )}
                          </Stack>
                        </Card>
                      ))}
                    </Stack>
                  )}
                  {CAL_BOOKING_URL && (
                    <Button
                      as="a"
                      href={CAL_BOOKING_URL}
                      target="_blank"
                      tone="primary"
                      text="Open scheduling page"
                    />
                  )}
                </Stack>
              </Card>
            </Stack>
          </Box>
        </Flex>
      </Stack>
    </Card>
  )
}

function GridHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        color: '#9ca3af',
        fontSize: 12,
        textTransform: 'uppercase'
      }}
    >
      {weekdayLabels.map((day) => (
        <span key={day} style={{textAlign: 'center', paddingBottom: 4}}>
          {day}
        </span>
      ))}
    </div>
  )
}

export const bookingCalendarTool = {
  name: 'booking-calendar',
  title: 'Booking Calendar',
  component: BookingCalendar
}
