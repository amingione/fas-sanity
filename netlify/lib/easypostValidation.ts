type AddressLike = Record<string, unknown> | null | undefined

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const resolveField = (address: AddressLike, keys: string[]): string => {
  if (!address || typeof address !== 'object') return ''
  for (const key of keys) {
    const value = (address as Record<string, unknown>)[key]
    const normalized = normalizeString(value)
    if (normalized) return normalized
  }
  return ''
}

export const getEasyPostAddressMissingFields = (address: AddressLike): string[] => {
  const missing: string[] = []
  if (!resolveField(address, ['street1', 'addressLine1', 'address_line1'])) missing.push('street1')
  if (!resolveField(address, ['city', 'city_locality'])) missing.push('city')
  if (!resolveField(address, ['state', 'state_province'])) missing.push('state')
  if (!resolveField(address, ['zip', 'postalCode', 'postal_code'])) missing.push('zip')
  if (!resolveField(address, ['country', 'country_code'])) missing.push('country')
  return missing
}

type ParcelLike = Record<string, unknown> | null | undefined

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export const getEasyPostParcelMissingFields = (parcel: ParcelLike): string[] => {
  const missing: string[] = []
  if (!parcel || typeof parcel !== 'object') {
    return ['length', 'width', 'height', 'weight']
  }
  const length = normalizeNumber((parcel as Record<string, unknown>).length)
  const width = normalizeNumber((parcel as Record<string, unknown>).width)
  const height = normalizeNumber((parcel as Record<string, unknown>).height)
  const weight = normalizeNumber((parcel as Record<string, unknown>).weight)
  if (!length || length <= 0) missing.push('length')
  if (!width || width <= 0) missing.push('width')
  if (!height || height <= 0) missing.push('height')
  if (!weight || weight <= 0) missing.push('weight')
  return missing
}
