type MaybeString = string | null | undefined

export type CustomerNameSource = {
  firstName?: MaybeString
  lastName?: MaybeString
  email?: MaybeString
  fallbackName?: MaybeString
}

export function normalizeNamePart(value?: MaybeString): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed || undefined
}

export function splitFullName(value?: MaybeString): {firstName?: string; lastName?: string} {
  const normalized = normalizeNamePart(value)
  if (!normalized) return {}
  const parts = normalized.split(' ')
  if (parts.length === 1) return {firstName: parts[0]}
  const [firstName, ...rest] = parts
  const lastName = rest.join(' ').trim()
  return {
    firstName,
    lastName: lastName || undefined,
  }
}

export function computeCustomerName({
  firstName,
  lastName,
  email,
  fallbackName,
}: CustomerNameSource): string | null {
  const first = normalizeNamePart(firstName)
  const last = normalizeNamePart(lastName)
  if (first && last) return `${first} ${last}`.trim()

  const emailValue = typeof email === 'string' ? email.trim() : ''
  const fallback = normalizeNamePart(fallbackName)

  if (emailValue) return emailValue
  if (first || last) return (first || last) || null
  if (fallback) return fallback
  return null
}
