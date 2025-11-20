import {
  format as formatDateFns,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns'

export type DateRangeValue = 'today' | 'week' | 'month' | 'year' | '7' | '30' | '90' | '365'

const WEEK_STARTS_ON: 0 | 1 = 1

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

type ToneColor = 'default' | 'primary' | 'positive' | 'caution' | 'critical'

export function getToday(referenceDate = new Date()): Date {
  return startOfDay(referenceDate)
}

export function getThisWeek(referenceDate = new Date()): Date {
  return startOfWeek(referenceDate, {weekStartsOn: WEEK_STARTS_ON})
}

export function getThisMonth(referenceDate = new Date()): Date {
  return startOfMonth(referenceDate)
}

export function getThisYear(referenceDate = new Date()): Date {
  return startOfYear(referenceDate)
}

export function getDaysAgo(days: number, referenceDate = new Date()): Date {
  if (!Number.isFinite(days)) return referenceDate
  return subDays(referenceDate, Math.max(days, 0))
}

export function formatDate(dateInput: Date | string | number, pattern = 'MMM d, yyyy'): string {
  const date =
    typeof dateInput === 'string'
      ? parseISO(dateInput)
      : typeof dateInput === 'number'
        ? new Date(dateInput)
        : dateInput
  if (Number.isNaN(date.getTime())) return '—'
  return formatDateFns(date, pattern)
}

export function formatCurrency(amount?: number | null): string {
  if (!Number.isFinite(Number(amount))) return '$0.00'
  return currencyFormatter.format(Number(amount))
}

export function formatNumber(value?: number | null): string {
  if (!Number.isFinite(Number(value))) return '0'
  return numberFormatter.format(Number(value))
}

export function formatPercent(decimal?: number | null): string {
  if (!Number.isFinite(Number(decimal))) return '0%'
  return percentFormatter.format(Number(decimal))
}

export function calculateTrend(current?: number | null, previous?: number | null): number | null {
  const currentValue = Number(current) || 0
  const previousValue = Number(previous) || 0
  if (previousValue === 0) {
    if (currentValue === 0) return 0
    return null
  }
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100
}

export function formatChange(current?: number | null, previous?: number | null): string {
  const change = calculateTrend(current ?? 0, previous ?? 0)
  if (change === null) return '—'
  const rounded = Number(change.toFixed(1))
  const prefix = rounded > 0 ? '+' : ''
  return `${prefix}${rounded}%`
}

export function getStatusColor(status?: string | null): ToneColor {
  if (!status) return 'default'
  const normalized = status.toLowerCase()
  if (normalized.includes('paid') || normalized.includes('completed') || normalized.includes('active'))
    return 'positive'
  if (normalized.includes('waiting') || normalized.includes('pending') || normalized.includes('scheduled'))
    return 'caution'
  if (normalized.includes('over') || normalized.includes('cancel') || normalized.includes('error'))
    return 'critical'
  return 'default'
}

export function getTrendColor(change?: number | null): ToneColor {
  if (typeof change !== 'number' || Number.isNaN(change)) return 'default'
  if (change > 0) return 'positive'
  if (change < 0) return 'critical'
  return 'default'
}

export function getSeverityColor(severity?: 'info' | 'warning' | 'error'): ToneColor {
  if (!severity) return 'default'
  switch (severity) {
    case 'warning':
      return 'caution'
    case 'error':
      return 'critical'
    default:
      return 'primary'
  }
}

export function buildDateFilter(
  range: DateRangeValue | number,
  referenceDate = new Date(),
): {start: string; end: string; label: string} {
  const now = referenceDate
  let startDate: Date
  let label = 'Custom'

  switch (range) {
    case 'today':
      startDate = getToday(now)
      label = 'Today'
      break
    case 'week':
      startDate = getThisWeek(now)
      label = 'This week'
      break
    case 'month':
      startDate = getThisMonth(now)
      label = 'This month'
      break
    case 'year':
      startDate = getThisYear(now)
      label = 'This year'
      break
    case '7':
    case '30':
    case '90':
    case '365':
      startDate = getDaysAgo(Number(range), now)
      label = `Last ${range} days`
      break
    default:
      if (typeof range === 'number') {
        startDate = getDaysAgo(range, now)
        label = `Last ${range} days`
      } else {
        startDate = getThisMonth(now)
      }
  }

  return {
    start: startDate.toISOString(),
    end: now.toISOString(),
    label,
  }
}

type AggregateDatum = {
  date: string | number | Date
  value: number
}

type AggregationPeriod = 'day' | 'week' | 'month'

export function aggregateByPeriod(
  data: AggregateDatum[],
  period: AggregationPeriod,
): Array<{label: string; value: number; date: string}> {
  const bucketMap = new Map<string, number>()

  const normalizeDate = (input: AggregateDatum['date']): Date => {
    if (input instanceof Date) return input
    if (typeof input === 'number') return new Date(input)
    if (typeof input === 'string') return parseISO(input)
    return new Date()
  }

  data.forEach((entry) => {
    const currentDate = normalizeDate(entry.date)
    let bucketStart: Date
    switch (period) {
      case 'week':
        bucketStart = startOfWeek(currentDate, {weekStartsOn: WEEK_STARTS_ON})
        break
      case 'month':
        bucketStart = startOfMonth(currentDate)
        break
      default:
        bucketStart = startOfDay(currentDate)
        break
    }
    const bucketKey = bucketStart.toISOString()
    bucketMap.set(bucketKey, (bucketMap.get(bucketKey) || 0) + (entry.value || 0))
  })

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([dateKey, total]) => ({
      label: formatDateFns(new Date(dateKey), period === 'month' ? 'MMM yyyy' : 'MMM d'),
      value: total,
      date: dateKey,
    }))
}
