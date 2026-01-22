export type CanonicalAddress = {
  name?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
}

type AddressLike = Record<string, unknown> | null | undefined

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const readFirst = (input: AddressLike, keys: string[]): string | undefined => {
  if (!input || typeof input !== 'object') return undefined
  for (const key of keys) {
    const value = trimString((input as Record<string, unknown>)[key])
    if (value) return value
  }
  return undefined
}

export const normalizeAddress = (
  input: AddressLike,
  extras?: {name?: string | null; email?: string | null; phone?: string | null},
): CanonicalAddress | null => {
  if (!input && !extras) return null

  const line1 = readFirst(input, ['line1', 'street1', 'address_line1', 'addressLine1', 'street'])
  const line2 = readFirst(input, ['line2', 'street2', 'address_line2', 'addressLine2'])
  const city = readFirst(input, ['city', 'city_locality', 'locality', 'town'])
  const state = readFirst(input, ['state', 'state_province', 'region', 'stateProvince'])
  const postalCode = readFirst(input, ['postalCode', 'postal_code', 'zip', 'zipCode'])
  const country = readFirst(input, ['country', 'country_code', 'countryCode'])
  const name = readFirst(input, ['name', 'fullName']) || trimString(extras?.name)
  const email = readFirst(input, ['email']) || trimString(extras?.email)
  const phone = readFirst(input, ['phone']) || trimString(extras?.phone)

  if (!line1 && !city && !state && !postalCode && !country && !name && !email && !phone) {
    return null
  }

  return {
    name,
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
    phone,
    email,
  }
}
