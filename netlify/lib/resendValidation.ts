type ResendRecipients = string | string[] | null | undefined

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export const normalizeResendRecipients = (to: ResendRecipients): string[] => {
  if (Array.isArray(to)) {
    return to.map((recipient) => normalizeString(recipient)).filter(Boolean)
  }
  const single = normalizeString(to)
  return single ? [single] : []
}

export const getMissingResendFields = (payload: {
  to?: ResendRecipients
  from?: string | null
  subject?: string | null
}): string[] => {
  const missing: string[] = []
  const recipients = normalizeResendRecipients(payload.to)
  if (!recipients.length) missing.push('to')
  if (!normalizeString(payload.from)) missing.push('from')
  if (!normalizeString(payload.subject)) missing.push('subject')
  return missing
}
