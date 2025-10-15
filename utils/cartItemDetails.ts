type MetadataEntryInput =
  | Array<{key?: string | null; value?: unknown} | null | undefined>
  | Record<string, unknown>
  | null
  | undefined

export type NormalizedMetadataEntry = {
  key: string
  value: string
}

const OPTION_KEYWORDS = ['option', 'vehicle', 'fitment', 'model', 'variant', 'trim', 'package', 'selection', 'config']
const UPGRADE_KEYWORDS = ['upgrade', 'addon', 'add_on', 'add-on', 'addOn', 'accessory']
const IGNORE_OPTION_KEYS = ['shipping_option', 'shipping_options', 'shippingoption']

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

  const details: string[] = []

  for (const {name, value, keys} of pairs.values()) {
    const normalized = value?.trim()
    if (!normalized) continue
    const label = (name || '').trim()
    details.push(label ? `${label}: ${normalized}` : normalized)
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
        const hasLabel = normalized.includes(':')
        details.push(hasLabel || !label ? normalized : `${label}: ${normalized}`)
      })
      consumed.add(key)
    }
  }

  const uniqueDetails = Array.from(new Set(details.map((d) => d.trim()).filter(Boolean)))
  const summary = uniqueDetails.length ? uniqueDetails.join(', ') : undefined

  return {summary, details: uniqueDetails, consumedKeys: consumed}
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

export {normalizeMetadataEntries}
