type MetadataEntryInput =
  | Array<{key?: string | null; value?: unknown} | null | undefined>
  | Record<string, unknown>
  | null
  | undefined

export type NormalizedMetadataEntry = {
  key: string
  value: string
}

const OPTION_KEYWORDS = ['option', 'vehicle', 'fitment', 'model', 'variant', 'trim', 'package', 'selection', 'config', 'size', 'color']
const UPGRADE_KEYWORDS = ['upgrade', 'addon', 'add_on', 'add-on', 'addon', 'addOn', 'accessory']
const IGNORE_OPTION_KEYS = [
  'shipping_option',
  'shipping_options',
  'shippingoption',
  'shipping_amount',
  'shipping_carrier',
  'shipping_service',
  'shipping_service_code',
  'shipping_service_name',
  'shipping_currency',
  'shipping_delivery_days',
  'shipping_estimated_delivery_date',
  'option_upcharge',
  'option_upcharge_display',
  'optionupcharge',
  'option_summary',
  'option_summary_display',
  'options_readable',
  'selected_options',
  'selected_options_json',
  'option_details_json',
  'configuration_signature',
  'option1_name',
  'option1_value',
  'option2_name',
  'option2_value',
  'option3_name',
  'option3_value',
  'base_price',
  'base_price_display',
  'baseprice',
  'display',
]

const toStringValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const json = JSON.stringify(value)
    return json === undefined ? undefined : json
  } catch {
    return undefined
  }
}

const humanize = (text: string): string =>
  text
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b}`)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const canonicalizeLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/\b(option|selected|selection|value|display|name|field|attribute|choice|custom)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const shouldSkipValue = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (/^\$?0+(\.0+)?$/i.test(trimmed)) return true
  if (/^none$/i.test(trimmed)) return true
  return false
}

const parseOptionValue = (value: string): string[] => {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (/^[\[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const segments: string[] = []
        for (const item of parsed) {
          if (!item) continue
          if (typeof item === 'string') {
            const v = item.trim()
            if (v) segments.push(v)
            continue
          }
          if (typeof item === 'object') {
            const name = toStringValue((item as any).name)?.trim()
            const label = toStringValue((item as any).label)?.trim()
            const val = toStringValue((item as any).value)?.trim()
            if (name && val) {
              segments.push(`${name}: ${val}`)
              continue
            }
            if (label && val) {
              segments.push(`${label}: ${val}`)
              continue
            }
            const fallback = toStringValue(item)?.trim()
            if (fallback) segments.push(fallback)
            continue
          }
        }
        if (segments.length) return segments
      } else if (parsed && typeof parsed === 'object') {
        const segments: string[] = []
        for (const [k, v] of Object.entries(parsed)) {
          const label = humanize(k)
          const val = toStringValue(v)
          if (!val) continue
          segments.push(label ? `${label}: ${val}` : val)
        }
        if (segments.length) return segments
      }
    } catch {
      // ignore JSON parse errors
    }
  }
  return [trimmed]
}

const parseListValue = (value: string): string[] => {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (/^[\[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const segments: string[] = []
        for (const item of parsed) {
          if (!item) continue
          if (typeof item === 'string') {
            const v = item.trim()
            if (v) segments.push(v)
            continue
          }
          if (typeof item === 'object') {
            const valueCandidate =
              toStringValue((item as any).name) ||
              toStringValue((item as any).value) ||
              toStringValue((item as any).label)
            const normalized = valueCandidate?.trim()
            if (normalized) segments.push(normalized)
          }
        }
        if (segments.length) return segments
      }
    } catch {
      // ignore JSON parse errors
    }
  }
  return trimmed
    .split(/[,;|]/g)
    .map((part) => part.trim())
    .filter(Boolean)
}

const normalizeMetadataEntries = (metadata: MetadataEntryInput | NormalizedMetadataEntry[]): NormalizedMetadataEntry[] => {
  if (Array.isArray(metadata)) {
    return metadata
      .map((entry) => {
        if (!entry) return null
        if ('key' in entry && 'value' in entry) {
          const key = toStringValue((entry as any).key)
          const value = toStringValue((entry as any).value)
          if (!key || !value) return null
          return {key, value}
        }
        return null
      })
      .filter((entry): entry is NormalizedMetadataEntry => Boolean(entry))
  }

  if (metadata && typeof metadata === 'object') {
    return Object.entries(metadata).reduce<NormalizedMetadataEntry[]>((acc, [rawKey, rawValue]) => {
      const key = toStringValue(rawKey)
      const value = toStringValue(rawValue)
      if (!key || !value) return acc
      acc.push({key, value})
      return acc
    }, [])
  }

  return []
}

const extractOptionDetails = (
  entries: NormalizedMetadataEntry[]
): {summary?: string; details: string[]; consumedKeys: Set<string>} => {
  const pairs = new Map<string, {name?: string; value?: string; keys: string[]}>()
  const consumed = new Set<string>()

  for (const {key, value} of entries) {
    const lowerKey = key.toLowerCase()
    const match = lowerKey.match(/^option(?:[_-]?|)([a-z0-9]+)?[_-]?(name|value)$/)
    if (match) {
      const slot = match[1] || ''
      const kind = match[2]
      const existing = pairs.get(slot) || {keys: []}
      if (kind === 'name') existing.name = value
      else existing.value = value
      existing.keys.push(key)
      pairs.set(slot, existing)
      continue
    }
  }

  const detailOrder: string[] = []
  const detailMap = new Map<string, {label: string; value: string}>()

  const registerDetail = (label: string, value: string) => {
    const trimmedValue = value.trim()
    if (shouldSkipValue(trimmedValue)) return
    const canonicalLabel = canonicalizeLabel(label)
    if (canonicalLabel && canonicalLabel === trimmedValue.toLowerCase()) return
    const uniqueKey = canonicalLabel
      ? `label:${canonicalLabel}`
      : `value:${trimmedValue.toLowerCase()}`
    if (detailMap.has(uniqueKey)) return
    detailMap.set(uniqueKey, {label: canonicalLabel ? label.trim() : '', value: trimmedValue})
    detailOrder.push(uniqueKey)
  }

  for (const {name, value, keys} of pairs.values()) {
    const normalized = value?.trim()
    if (!normalized) continue
    registerDetail(name || '', normalized)
    keys.forEach((key) => consumed.add(key))
  }

  for (const {key, value} of entries) {
    if (consumed.has(key)) continue
    const lowerKey = key.toLowerCase()
    if (IGNORE_OPTION_KEYS.some((ignore) => lowerKey.includes(ignore))) continue
    if (!OPTION_KEYWORDS.some((kw) => lowerKey.includes(kw))) continue
    const label = humanize(key)
    const segments = parseOptionValue(value)
    if (segments.length) {
      segments.forEach((segment) => {
        const normalized = segment.trim()
        if (!normalized) return
        if (normalized.includes(':')) {
          const [maybeLabel, ...rest] = normalized.split(':')
          registerDetail(maybeLabel || label, rest.join(':'))
        } else {
          registerDetail(label, normalized)
        }
      })
      consumed.add(key)
    } else {
      registerDetail(label, value)
      consumed.add(key)
    }
  }

  const orderedDetails = detailOrder
    .map((uniqueKey) => {
      const detail = detailMap.get(uniqueKey)
      if (!detail) return ''
      const {label, value} = detail
      if (!value) return ''
      return label ? `${label}: ${value}` : value
    })
    .map((detail) => detail.trim())
    .filter(Boolean)

  const summary = orderedDetails.length ? orderedDetails.join(', ') : undefined

  return {summary, details: orderedDetails, consumedKeys: consumed}
}

const extractUpgrades = (
  entries: NormalizedMetadataEntry[]
): {upgrades: string[]; consumedKeys: Set<string>} => {
  const upgrades: string[] = []
  const consumed = new Set<string>()

  for (const {key, value} of entries) {
    const lowerKey = key.toLowerCase()
    if (!UPGRADE_KEYWORDS.some((kw) => lowerKey.includes(kw))) continue
    const segments = parseListValue(value)
    if (segments.length) {
      upgrades.push(...segments)
      consumed.add(key)
    }
  }

  const unique = Array.from(new Set(upgrades.filter(Boolean)))
  return {upgrades: unique, consumedKeys: consumed}
}

export const coerceStringArray = (input: unknown): string[] => {
  if (!input) return []

  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'number' || typeof item === 'boolean') return String(item)
        if (item && typeof item === 'object') {
          if ('value' in item) return toStringValue((item as any).value) || ''
          return toStringValue(item) || ''
        }
        return ''
      })
      .map((value) => value.trim())
      .filter(Boolean)
  }

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return []
    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.flatMap((item) => coerceStringArray(item))
        }
        if (parsed && typeof parsed === 'object') {
          return Object.entries(parsed)
            .map(([key, value]) => {
              const val = toStringValue(value)
              if (!val) return ''
              const label = humanize(key)
              return label ? `${label}: ${val}` : val
            })
            .filter(Boolean)
        }
      } catch {
        // ignore JSON parse errors
      }
    }
    return trimmed
      .split(/[,;|]/g)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return [String(input)]
  }

  return []
}

export const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

export const deriveOptionsFromMetadata = (
  metadata: MetadataEntryInput | NormalizedMetadataEntry[]
): {
  optionSummary?: string
  optionDetails: string[]
  upgrades: string[]
  consumedKeys: string[]
} => {
  const normalized = normalizeMetadataEntries(metadata)
  if (!normalized.length) {
    return {optionSummary: undefined, optionDetails: [], upgrades: [], consumedKeys: []}
  }

  const {summary, details, consumedKeys: optionKeys} = extractOptionDetails(normalized)
  const {upgrades, consumedKeys: upgradeKeys} = extractUpgrades(normalized)

  const consumed = new Set<string>()
  optionKeys.forEach((key) => consumed.add(key))
  upgradeKeys.forEach((key) => consumed.add(key))

  return {
    optionSummary: summary,
    optionDetails: details,
    upgrades,
    consumedKeys: Array.from(consumed),
  }
}

export const remainingMetadataEntries = (
  metadata: MetadataEntryInput | NormalizedMetadataEntry[],
  usedKeys: string[]
): NormalizedMetadataEntry[] => {
  if (!usedKeys.length) return normalizeMetadataEntries(metadata)
  const exclude = new Set(usedKeys.map((key) => key.toLowerCase()))
  return normalizeMetadataEntries(metadata).filter((entry) => !exclude.has(entry.key.toLowerCase()))
}

const METADATA_EXCLUDE_PATTERNS = [
  /^base price/i,
  /^base price display/i,
  /^option upcharge/i,
  /^option upcharge display/i,
  /^product image/i,
  /^product url/i,
  /^product name/i,
  /^sanity /i,
  /^quantity:/i,
  /^unit price/i,
  /^shipping /i,
]

export const shouldDisplayMetadataSegment = (text: string): boolean => {
  const trimmed = text.trim()
  if (!trimmed) return false
  return !METADATA_EXCLUDE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export {normalizeMetadataEntries}
