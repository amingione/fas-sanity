import type {SanityClient} from 'sanity'

export interface ProductDocument {
  _id: string
  title?: string
  shortDescription?: any
  description?: any
  keyFeatures?: any
  brand?: string
  compatibleVehicles?: any[]
  options?: any[]
  category?: any[]
  tags?: string[]
  [key: string]: any
}

type PortableText = Array<
  | {
      _type?: string
      children?: Array<{text?: string}>
      text?: string
    }
  | string
  | null
  | undefined
>

const API_VERSION = '2024-10-01'

const PLATFORM_KEYWORDS = new Set([
  'powerstroke',
  'duramax',
  'cummins',
  'ecoboost',
  'hellcat',
  'hemi',
  'super-duty',
  'raptor',
  'trx',
  'tacoma',
  'tundra',
  'wrangler',
  'gladiator',
  'silverado',
  'sierra',
  'f-150',
  'f150',
  'bronco',
  'mustang',
  'camaro',
  'charger',
  'challenger',
  'corvette',
])

const DIESEL_PLATFORMS = new Set(['powerstroke', 'duramax', 'cummins'])
const YEAR_RANGE_REGEX = /^\d{4}-\d{4}$/
const STOP_WORDS = new Set([
  'and',
  'or',
  'for',
  'the',
  'your',
  'with',
  'a',
  'an',
  'by',
  'of',
  'to',
  'in',
  'on',
  'from',
  'into',
  'at',
  'is',
  'are',
  'be',
  'this',
  'that',
  'it',
  'its',
  'their',
  'them',
  'these',
  'those',
  'option',
  'options',
  'value',
  'values',
  'finish',
  'color',
  'colors',
  'gloss',
  'black',
  'brushed',
  'aluminum',
  'direct',
  'fit',
  'high',
  'flow',
  'upgrade',
  'performance',
])

const BLOCKED_TAGS = new Set(['fas', 'motorsports', 'super', 'duty'])
const COMPOUND_SUFFIXES = [
  'kit',
  'kits',
  'upgrade',
  'upgrades',
  'system',
  'systems',
  'package',
  'packages',
  'bundle',
  'bundles',
]

const ESSENTIAL_SHORT_TAGS = new Set([
  'kit',
  'ram',
  'trx',
  'srt',
  'srt8',
  'zr1',
  'z06',
  'z28',
  'z71',
  'gt',
  'gt350',
  'gt500',
  'oem',
  'oe',
  'ecu',
  'tcu',
  'awd',
  'utv',
  'atv',
  '4x4',
  'ev',
  'hybrid',
])

function shouldKeepTag(tag: string): boolean {
  if (!tag) return false
  if (BLOCKED_TAGS.has(tag)) return false
  if (PLATFORM_KEYWORDS.has(tag)) return true
  if (STOP_WORDS.has(tag)) return false
  if (tag.split('-').length > 4) return false
  if (tag.includes('your-') || tag.endsWith('-your') || tag.startsWith('your-')) return false
  if (tag.length <= 2) return false
  if (
    tag.length <= 3 &&
    !/[0-9]/.test(tag) &&
    !ESSENTIAL_SHORT_TAGS.has(tag) &&
    !PLATFORM_KEYWORDS.has(tag)
  ) {
    return false
  }

  const parts = tag.split('-')
  // If every part is a stop word and not essential, reject the tag
  if (parts.every((part) => STOP_WORDS.has(part) && !ESSENTIAL_SHORT_TAGS.has(part))) {
    return false
  }

  return true
}

function pushTag(target: string[], value: string | null | undefined) {
  if (!value) return
  if (!shouldKeepTag(value)) return
  target.push(value)
}

function normalizeTag(value: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'"`]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9.\s/-]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/^\.+|\.+$/g, '')

  return normalized || null
}

function extractPortableText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return (value as PortableText)
      .map((block) => {
        if (!block) return ''
        if (typeof block === 'string') return block
        if (typeof block.text === 'string') return block.text
        if (
          typeof block === 'object' &&
          Array.isArray(block.children)
        ) {
          return block.children
            .map((child) => (typeof child?.text === 'string' ? child.text : ''))
            .join(' ')
        }
        return ''
      })
      .join(' ')
  }

  return ''
}

function collectStrings(value: unknown, maxDepth = 2): string[] {
  if (maxDepth < 0 || !value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStrings(entry, maxDepth - 1))
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith('_'))
      .flatMap(([, entry]) => collectStrings(entry, maxDepth - 1))
  }
  return []
}

function ensureUniqueOrder(values: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    ordered.push(value)
  }
  return ordered
}

function mergeTagLists(manualTags: string[], generatedTags: string[]): string[] {
  const sanitizedManual = manualTags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter((tag) => !!tag)

  const lowerCaseSet = new Set<string>()
  const merged: string[] = []

  for (const tag of sanitizedManual) {
    const lower = tag.toLowerCase()
    if (lowerCaseSet.has(lower)) continue
    lowerCaseSet.add(lower)
    merged.push(tag)
  }

  for (const tag of generatedTags) {
    const lower = tag.toLowerCase()
    if (lowerCaseSet.has(lower)) continue
    lowerCaseSet.add(lower)
    merged.push(tag)
  }

  return merged
}

async function resolveReferenceLabels(
  client: SanityClient,
  ids: string[]
): Promise<string[]> {
  if (!ids.length) return []
  const query = `*[_id in $ids]{_id, title, name, label, modelName, make, trim, brand, manufacturer, "fullName": coalesce(make, brand, manufacturer)}`

  const docs = await client.fetch<
    Array<{
      _id: string
      title?: string
      name?: string
      label?: string
      modelName?: string
      make?: string
      trim?: string
      fullName?: string
    }>
  >(query, {ids})

  const labels: string[] = []

  for (const doc of docs) {
    const candidates = [
      doc.title,
      doc.name,
      doc.label,
      doc.modelName,
      doc.trim,
    ]
    if (doc.fullName) {
      candidates.push(doc.fullName)
    }
    labels.push(...candidates.filter((candidate): candidate is string => !!candidate))
  }

  return ensureUniqueOrder(labels)
}

function tokenize(text: string): string[] {
  return text
    .split(/[,;:/()]+/)
    .flatMap((segment) =>
      segment
        .split(/\b(?:and|or|with|\+|&)\b/i)
        .flatMap((part) => {
          const trimmed = part.trim()
          if (!trimmed) return []
          const words = trimmed.split(/\s+/)
          return [trimmed, ...words]
        })
        .filter(Boolean)
    )
}

function extractMeasurementTokens(candidates: string[]): string[] {
  return candidates
    .map((candidate) => {
      const match = candidate.match(/\b\d+(\.\d+)?l\b/i)
      return match ? normalizeTag(match[0]) : null
    })
    .filter((value): value is string => !!value)
}

function extractCompoundTags(value: string): string[] {
  const matches: string[] = []
  const regex = new RegExp(
    `\\b([a-z0-9./-]{2,})\\s+(${COMPOUND_SUFFIXES.join('|')})\\b`,
    'gi'
  )

  let match: RegExpExecArray | null
  while ((match = regex.exec(value)) !== null) {
    const normalized = normalizeTag(`${match[1]} ${match[2]}`)
    if (normalized) {
      matches.push(normalized)
    }
  }

  return matches
}

export async function generateProductTags(
  doc: ProductDocument,
  client: SanityClient
): Promise<string[]> {
  const clientWithVersion = client.withConfig({apiVersion: API_VERSION})
  const candidateStrings: string[] = []

  if (doc.title) candidateStrings.push(doc.title)
  if (doc.brand) candidateStrings.push(doc.brand)
  if (doc.shortDescription) candidateStrings.push(extractPortableText(doc.shortDescription))
  if (doc.description) candidateStrings.push(extractPortableText(doc.description))
  if (doc.keyFeatures) candidateStrings.push(...collectStrings(doc.keyFeatures))

  if (Array.isArray(doc.options)) {
    for (const option of doc.options) {
      const optionStrings = collectStrings(option)
      candidateStrings.push(...optionStrings)
    }
  }

  const vehicleRefs =
    Array.isArray(doc.compatibleVehicles)
      ? doc.compatibleVehicles
          .map((entry) =>
            entry && typeof entry === 'object' && typeof entry._ref === 'string'
              ? entry._ref
              : typeof entry === 'string'
              ? entry
              : null
          )
          .filter((value): value is string => !!value)
      : []

  const categoryRefs =
    Array.isArray(doc.category)
      ? doc.category
          .map((entry) =>
            entry && typeof entry === 'object' && typeof entry._ref === 'string'
              ? entry._ref
              : typeof entry === 'string'
              ? entry
              : null
          )
          .filter((value): value is string => !!value)
      : []

  const [vehicleLabels, categoryLabels] = await Promise.all([
    resolveReferenceLabels(clientWithVersion, vehicleRefs),
    resolveReferenceLabels(clientWithVersion, categoryRefs),
  ])

  candidateStrings.push(...vehicleLabels, ...categoryLabels)

  const candidateBlob = candidateStrings.join(' ').toLowerCase()
  const compoundTags = candidateStrings.flatMap(extractCompoundTags)

  const normalizedTags: string[] = []

  for (const raw of candidateStrings) {
    const normalized = normalizeTag(raw)
    pushTag(normalizedTags, normalized)

    const segments = tokenize(raw)
    for (const segment of segments) {
      const tokenized = normalizeTag(segment)
      pushTag(normalizedTags, tokenized)
    }
  }

  for (const compound of compoundTags) {
    pushTag(normalizedTags, compound)
  }

  const measurementTokens = extractMeasurementTokens(candidateStrings)

  const brandTag = normalizeTag(doc.brand ?? '')
  const platformTokens = normalizedTags.filter((tag) => PLATFORM_KEYWORDS.has(tag))

  pushTag(normalizedTags, brandTag)

  const hasKit =
    normalizedTags.some((tag) => tag.includes('kit')) || /\bkit(s)?\b/.test(candidateBlob)
  const hasUpgrade =
    normalizedTags.some((tag) => tag.includes('upgrade')) || /\bupgrade(d|s)?\b/.test(candidateBlob)
  const hasPerformance =
    normalizedTags.some((tag) => tag.includes('performance')) || /\bperformance(s)?\b/.test(candidateBlob)
  const measurementTargets = platformTokens.length
    ? platformTokens
    : (brandTag ? [brandTag] : [])

  for (const measurement of measurementTokens) {
    const combos = new Set<string>()

    for (const target of measurementTargets) {
      const combo = normalizeTag(`${measurement}-${target}`)
      if (combo) combos.add(combo)
    }

    if (hasKit) {
      const combo = normalizeTag(`${measurement}-kit`)
      if (combo) combos.add(combo)
    }

    if (hasUpgrade) {
      const combo = normalizeTag(`${measurement}-upgrade`)
      if (combo) combos.add(combo)
    }

    if (hasPerformance) {
      const combo = normalizeTag(`${measurement}-performance`)
      if (combo) combos.add(combo)
    }

    for (const combo of combos) {
      pushTag(normalizedTags, combo)
    }
  }

  const yearRanges = normalizedTags.filter((tag) => YEAR_RANGE_REGEX.test(tag))
  for (const yearRange of yearRanges) {
    for (const platform of platformTokens) {
      const combo = normalizeTag(`${yearRange}-${platform}`)
      pushTag(normalizedTags, combo)
    }
  }

  if (platformTokens.some((token) => DIESEL_PLATFORMS.has(token))) {
    pushTag(normalizedTags, 'diesel-performance')
    pushTag(normalizedTags, 'diesel-parts')
  }

  if (hasUpgrade) {
    for (const platform of platformTokens) {
      const combo = normalizeTag(`${platform}-upgrade`)
      pushTag(normalizedTags, combo)
    }
  }

  const generated = ensureUniqueOrder(
    normalizedTags.filter(shouldKeepTag)
  )

  const manualTags = Array.isArray(doc.tags)
    ? doc.tags.filter((value): value is string => typeof value === 'string')
    : []

  return mergeTagLists(manualTags, generated)
}
