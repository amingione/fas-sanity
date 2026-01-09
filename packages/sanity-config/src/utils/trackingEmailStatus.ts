const normalizeValue = (value?: string | null) => {
  if (!value) return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

const TRACKING_EMAIL_STATUSES = new Set([
  'notified',
  'tracking email sent',
  'tracking notification sent',
  'tracking confirmation sent',
  'shipping confirmation emailed',
  'tracking emailed',
])

export const isTrackingEmailStatus = (value?: string | null) => {
  const normalized = normalizeValue(value)
  return normalized ? TRACKING_EMAIL_STATUSES.has(normalized) : false
}
