type MetadataEntryInput =
  | Array<{key?: string | null; value?: unknown} | null | undefined>
  | Record<string, unknown>
  | null
  | undefined

export type NormalizedMetadataEntry = {
  key: string
  value: string
}

export type NormalizedOptionPayload = {
  optionSummary?: string
  optionDetails: string[]
  upgrades: string[]
}

export type DerivedCartChoices = {
  selectedVariant?: string
  addOns: string[]
}

const OPTION_KEYWORDS = [
  'option',
  'vehicle',
  'fitment',
  'model',
  'variant',
  'trim',
  'package',
  'selection',
  'config',
  'size',
  'color',
]
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
    .replace(
      /\b(option|selected|selection|value|display|name|field|attribute|choice|custom)\b/g,
      '',
    )
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
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
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
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
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

export const stripPlatformPrefix = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const withoutPrefix = trimmed.replace(/^Platform\s*:\s*[^|]+?\|\s*/i, '').trim()
  return withoutPrefix || trimmed
}

export const sanitizeCartItemName = (value?: string | null): string | undefined =>
  stripPlatformPrefix(value)

const normalizeMetadataEntries = (
  metadata: MetadataEntryInput | NormalizedMetadataEntry[],
): NormalizedMetadataEntry[] => {
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
  entries: NormalizedMetadataEntry[],
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

  const GENERIC_LABELS = new Set([
    'variation',
    'variant',
    'option',
    'selected',
    'selection',
    'attribute',
    'config',
    'configured',
    'value',
    'name',
  ])

  const orderedDetails = detailOrder
    .map((uniqueKey) => {
      const detail = detailMap.get(uniqueKey)
      if (!detail) return ''
      const {label, value} = detail
      if (!value) return ''
      const lower = (label || '').trim().toLowerCase()
      if (!lower || GENERIC_LABELS.has(lower)) return value
      return `${label}: ${value}`
    })
    .map((detail) => detail.trim())
    .filter(Boolean)

  const summary = orderedDetails.length ? orderedDetails.join(', ') : undefined

  return {summary, details: orderedDetails, consumedKeys: consumed}
}

const extractUpgrades = (
  entries: NormalizedMetadataEntry[],
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
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
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
      .split(/[,;|•]/g)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return [String(input)]
  }

  return []
}

export const uniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

const OPTION_PREFIX = /^option\s*\d*[:\-\s]*/i
const UPGRADE_PREFIX = /^(?:upgrades?|upgrade option|add[\s-]?ons?|add[\s-]?on option)[:\-\s]*/i
const UPGRADE_LABEL = /^(?:upgrades?|add[\s-]?ons?)$/i

const normalizeOptionSegment = (raw: string, forceUpgrade = false): {value: string; isUpgrade: boolean} | null => {
  let text = raw.replace(/^[•\-\s]+/, '').trim()
  if (!text) return null

  let isUpgrade = forceUpgrade

  const stripPrefix = (pattern: RegExp) => {
    const next = text.replace(pattern, '').trim()
    if (next !== text) {
      text = next
      return true
    }
    return false
  }

  while (stripPrefix(OPTION_PREFIX)) {
    // keep stripping option markers like "Option 1:"
  }
  while (stripPrefix(UPGRADE_PREFIX)) {
    isUpgrade = true
  }

  const colonIndex = text.indexOf(':')
  if (colonIndex > -1) {
    const label = text.slice(0, colonIndex).trim()
    if (UPGRADE_LABEL.test(label)) {
      isUpgrade = true
      text = text.slice(colonIndex + 1).trim()
    }
  }

  if (!text) return null

  return {value: text, isUpgrade}
}

const appendUnique = (list: string[], seen: Set<string>, value: string) => {
  const key = value.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  list.push(value)
}

export const normalizeOptionSelections = (input: {
  optionSummary?: string | string[] | null
  optionDetails?: string | string[] | null
  upgrades?: string | string[] | null
}): NormalizedOptionPayload => {
  const optionSegments = [
    ...coerceStringArray(input.optionDetails),
    ...coerceStringArray(input.optionSummary),
  ]
  const upgradeSegments = coerceStringArray(input.upgrades)

  const options: string[] = []
  const upgrades: string[] = []
  const seenOptions = new Set<string>()
  const seenUpgrades = new Set<string>()

  for (const segment of optionSegments) {
    const normalized = normalizeOptionSegment(segment)
    if (!normalized) continue
    if (normalized.isUpgrade) {
      appendUnique(upgrades, seenUpgrades, normalized.value)
    } else {
      appendUnique(options, seenOptions, normalized.value)
    }
  }

  for (const upgrade of upgradeSegments) {
    const normalized = normalizeOptionSegment(upgrade, true) || {value: upgrade.trim(), isUpgrade: true}
    if (!normalized.value) continue
    appendUnique(upgrades, seenUpgrades, normalized.value)
  }

  const optionSummary = options.length ? options.join(', ') : undefined

  return {
    optionSummary,
    optionDetails: options,
    upgrades,
  }
}

export const deriveVariantAndAddOns = (input: {
  selectedVariant?: string | null
  optionDetails?: unknown
  upgrades?: unknown
}): DerivedCartChoices => {
  const details = coerceStringArray(input.optionDetails)
  const upgrades = coerceStringArray(input.upgrades)
  let selectedVariant: string | undefined
  for (const detail of details) {
    const lower = detail.toLowerCase()
    if (lower.includes('upgrade')) continue
    const colonIndex = detail.indexOf(':')
    if (colonIndex > -1) {
      const value = detail.slice(colonIndex + 1).trim()
      if (value) {
        selectedVariant = value
        break
      }
    }
    const trimmed = detail.trim()
    if (trimmed) {
      selectedVariant = trimmed
      break
    }
  }
  if (!selectedVariant && typeof input.selectedVariant === 'string') {
    selectedVariant = input.selectedVariant.trim() || undefined
  }

  const addOns = upgrades
    .map((upgrade) => upgrade.replace(/^upgrade\s*:\s*/i, '').trim())
    .filter(Boolean)

  return {
    selectedVariant,
    addOns,
  }
}

export const normalizeCartItemChoices = (input: {
  selectedOption?: string | null
  addOns?: unknown
  optionSummary?: string | string[] | null
  optionDetails?: string | string[] | null
  upgrades?: string | string[] | null
}): {selectedOption?: string; addOns: string[]} => {
  const {selectedVariant, addOns} = deriveVariantAndAddOns({
    selectedVariant: input.selectedOption || undefined,
    optionDetails: input.optionDetails,
    upgrades: input.upgrades,
  })
  const explicitAddOns = uniqueStrings([
    ...addOns,
    ...coerceStringArray(input.addOns),
  ])

  return {
    selectedOption: selectedVariant,
    addOns: explicitAddOns,
  }
}

const BASE_PRICE_KEYS = ['base_price', 'base price', 'baseprice', 'base_price_display', 'base price display']
const UPGRADE_TOTAL_KEYS = [
  'upgrade_total',
  'upgrades_total',
  'upgrade total',
  'upgrades total',
  'upgrade_total_display',
  'upgrades_total_display',
]
const OPTION_UPCHARGE_KEYS = ['option_upcharge', 'option upcharge', 'option_upcharge_display', 'option upcharge display']

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')

const parseAmount = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.+-]/g, '')
    if (!cleaned) return undefined
    const parsed = Number.parseFloat(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const findAmountInMap = (map?: Record<string, string>, keys: string[] = []): number | undefined => {
  if (!map) return undefined
  const normalizedMap = Object.entries(map).reduce<Record<string, string>>((acc, [k, v]) => {
    if (!k) return acc
    acc[normalizeKey(k)] = v
    return acc
  }, {})
  for (const key of keys) {
    const value = normalizedMap[normalizeKey(key)]
    const parsed = parseAmount(value)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

const entriesToMap = (entries?: NormalizedMetadataEntry[]) => {
  if (!entries || !entries.length) return undefined
  return entries.reduce<Record<string, string>>((acc, entry) => {
    if (!entry?.key) return acc
    acc[entry.key] = entry.value
    return acc
  }, {})
}

export const resolveUpgradeTotal = (input: {
  metadataMap?: Record<string, string>
  metadataEntries?: NormalizedMetadataEntry[]
  price?: number
  quantity?: number
  lineTotal?: number
  total?: number
}): number | undefined => {
  const metadataMap = input.metadataMap || entriesToMap(input.metadataEntries)
  const qty = Math.max(1, Number.isFinite(input.quantity) ? Number(input.quantity) : 1)
  const unitPrice = parseAmount(input.price)
  const lineTotal = parseAmount(input.lineTotal)
  const total = parseAmount(input.total)

  const candidates: number[] = []

  const basePrice = findAmountInMap(metadataMap, BASE_PRICE_KEYS)
  const optionUpcharge = findAmountInMap(metadataMap, OPTION_UPCHARGE_KEYS)
  const upgradeTotalMeta = findAmountInMap(metadataMap, UPGRADE_TOTAL_KEYS)

  if (optionUpcharge !== undefined) candidates.push(optionUpcharge)
  if (upgradeTotalMeta !== undefined) candidates.push(upgradeTotalMeta)

  const derivedTotal = total ?? lineTotal
  const effectiveUnit = basePrice ?? unitPrice
  if (derivedTotal !== undefined && effectiveUnit !== undefined) {
    const diff = derivedTotal - effectiveUnit * qty
    if (diff > 0) candidates.push(diff)
  }

  if (!candidates.length) return undefined
  const best = Math.max(...candidates.filter((v) => Number.isFinite(v) && v > 0))
  if (!Number.isFinite(best) || best <= 0) return undefined
  return Math.round(best * 100) / 100
}

export const deriveOptionsFromMetadata = (
  metadata: MetadataEntryInput | NormalizedMetadataEntry[],
): {
  optionSummary?: string
  optionDetails: string[]
  upgrades: string[]
  consumedKeys: string[]
} => {
  const normalized = normalizeMetadataEntries(metadata)
  if (!normalized.length) {
    return {
      optionSummary: undefined,
      optionDetails: [],
      upgrades: [],
      consumedKeys: [],
    }
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
  usedKeys: string[],
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
