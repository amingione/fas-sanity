import EasyPost from '@easypost/api'

const EASYPOST_API_KEY = (process.env.EASYPOST_API_KEY || '').trim()

type EasyPostClient = InstanceType<typeof EasyPost>

let cachedClient: EasyPostClient | null = null

export function getEasyPostClient(): EasyPostClient {
  if (!EASYPOST_API_KEY) {
    throw new Error('Missing EASYPOST_API_KEY')
  }
  if (!cachedClient) {
    cachedClient = new EasyPost(EASYPOST_API_KEY)
  }
  return cachedClient
}

export const MIN_OUNCES = 1
export const MIN_DIMENSION_INCHES = 1

export type WeightInput = {value?: number; unit?: string} | number | string | null | undefined

export type DimensionsInput =
  | {length?: number; width?: number; height?: number; unit?: string}
  | null
  | undefined

export function resolveWeight(
  input: WeightInput,
  fallback: WeightInput,
): {ounces: number; pounds: number} {
  const source = input ?? fallback
  let value = 0
  let unit = 'pound'

  if (typeof source === 'number') {
    value = source
  } else if (typeof source === 'string') {
    const parsed = Number.parseFloat(source)
    if (Number.isFinite(parsed)) value = parsed
  } else if (source && typeof source === 'object') {
    const rawValue =
      'value' in source && typeof source.value === 'number'
        ? source.value
        : typeof (source as any)?.weight === 'number'
          ? (source as any).weight
          : typeof (source as any)?.amount === 'number'
            ? (source as any).amount
            : Number.parseFloat((source as any)?.value)
    if (Number.isFinite(rawValue)) value = Number(rawValue)
    const rawUnit =
      (source as any)?.unit ||
      (source as any)?.units ||
      (source as any)?.Unit ||
      (source as any)?.measurement ||
      'pound'
    if (typeof rawUnit === 'string' && rawUnit.trim()) {
      unit = rawUnit.trim().toLowerCase()
    }
  }

  if (!Number.isFinite(value) || value <= 0) {
    value = 1
  }

  let ounces = value
  switch (unit) {
    case 'ounce':
    case 'ounces':
    case 'oz':
      ounces = value
      break
    case 'gram':
    case 'grams':
    case 'g':
      ounces = value * 0.03527396
      break
    case 'kilogram':
    case 'kilograms':
    case 'kg':
      ounces = value * 35.27396
      break
    case 'pound':
    case 'pounds':
    case 'lb':
    case 'lbs':
    default:
      ounces = value * 16
      break
  }

  if (!Number.isFinite(ounces) || ounces <= 0) {
    ounces = MIN_OUNCES
  }

  const pounds = ounces / 16
  return {
    ounces: Number(ounces.toFixed(2)),
    pounds: Number(pounds.toFixed(2)),
  }
}

export function resolveDimensions(
  input: DimensionsInput,
  fallback: DimensionsInput,
): {
  length: number
  width: number
  height: number
} {
  const source = input ?? fallback ?? {}
  const unit = typeof source?.unit === 'string' ? source.unit.trim().toLowerCase() : 'inch'

  const parseSide = (value: unknown): number | null => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  let length = parseSide((source as any)?.length) ?? 0
  let width = parseSide((source as any)?.width) ?? 0
  let height = parseSide((source as any)?.height) ?? 0

  const convert = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return 0
    if (unit === 'centimeter' || unit === 'centimeters' || unit === 'cm') {
      return val / 2.54
    }
    if (unit === 'meter' || unit === 'meters' || unit === 'm') {
      return val * 39.3701
    }
    return val
  }

  length = convert(length)
  width = convert(width)
  height = convert(height)

  if (length <= 0) length = MIN_DIMENSION_INCHES
  if (width <= 0) width = MIN_DIMENSION_INCHES
  if (height <= 0) height = MIN_DIMENSION_INCHES

  return {
    length: Number(length.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
  }
}
