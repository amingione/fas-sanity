import type {PortableTextBlock} from '@portabletext/types'

export interface ProductSpecification {
  label?: unknown
  value?: unknown
}

export interface ProductAttribute {
  name?: unknown
  value?: unknown
}

export interface ProductOptionColor {
  title?: unknown
}

export interface ProductOptionSize {
  title?: unknown
}

export interface ProductOptionSet {
  _type?: string
  title?: unknown
  colors?: unknown
  sizes?: unknown
}

export interface ProductFeedSource {
  productHighlights?: unknown
  productDetails?: unknown
  specifications?: ProductSpecification[] | null
  attributes?: ProductAttribute[] | null
  options?: ProductOptionSet[] | null
  boxDimensions?: unknown
  color?: unknown
  size?: unknown
  material?: unknown
  productLength?: unknown
  productWidth?: unknown
}

export interface ProductDetailEntry {
  sectionName: string
  attributeName: string
  attributeValue: string
}

export interface DerivedProductFeedFields {
  highlights: string[]
  details: ProductDetailEntry[]
  color?: string
  colorValues: string[]
  sizes: string[]
  material?: string
  productLength?: string
  productWidth?: string
}

const COLOR_NAMES = ['color', 'colour', 'color name', 'finish color']
const SIZE_NAMES = ['size', 'sizes', 'fitment size', 'product size']
const MATERIAL_NAMES = ['material', 'materials', 'construction', 'finish']
const LENGTH_NAMES = [
  'product length',
  'length',
  'overall length',
  'length (in)',
  'length (inches)',
]
const WIDTH_NAMES = ['product width', 'width', 'overall width', 'width (in)', 'width (inches)']
const DIMENSION_UNITS: Record<string, string> = {
  in: 'in',
  inch: 'in',
  inches: 'in',
  cm: 'cm',
  mm: 'mm',
  ft: 'ft',
  m: 'm',
}

const MAX_HIGHLIGHT_LENGTH = 150
const MAX_DETAILS = 100

interface ParsedBoxDimensions {
  length?: string
  width?: string
  height?: string
}

function condenseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') {
    const condensed = condenseWhitespace(value)
    return condensed.length > 0 ? condensed : undefined
  }
  if (typeof value === 'number') return condenseWhitespace(String(value))
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      const compact = value
        .map((item) => {
          if (typeof item === 'string') return condenseWhitespace(item)
          if (typeof item === 'number') return condenseWhitespace(String(item))
          if (typeof item === 'object' && item && (item as PortableTextBlock)?._type === 'block') {
            const children = (item as PortableTextBlock).children
            const text = Array.isArray(children)
              ? children
                  .map((child) =>
                    typeof child === 'object' && child && 'text' in child
                      ? (child as any).text
                      : '',
                  )
                  .join('')
              : ''
            return condenseWhitespace(text)
          }
          return undefined
        })
        .filter((item): item is string => typeof item === 'string' && item.length > 0)
      if (compact.length > 0) return compact.join(' ')
    }
    if ('text' in (value as Record<string, unknown>)) {
      const text = toText((value as Record<string, unknown>).text)
      if (text) return text
    }
  }
  return undefined
}

function normalizeKey(value: string): string {
  return condenseWhitespace(value).toLowerCase()
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    const text = toText(value)
    if (!text) return
    const key = normalizeKey(text)
    if (seen.has(key)) return
    seen.add(key)
    result.push(text)
  })
  return result
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max).trim()
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.map((item) => toText(item)).filter((item): item is string => typeof item === 'string'),
    )
  }
  const text = toText(value)
  return text ? [text] : []
}

function parseDetailString(input: string): ProductDetailEntry | null {
  const parts = input
    .split(':')
    .map((part) => toText(part))
    .filter((part): part is string => Boolean(part))
  if (parts.length >= 3) {
    return {
      sectionName: parts[0],
      attributeName: parts[1],
      attributeValue: parts.slice(2).join(': '),
    }
  }
  if (parts.length === 2) {
    return {
      sectionName: 'Details',
      attributeName: parts[0],
      attributeValue: parts[1],
    }
  }
  if (parts.length === 1) {
    return {
      sectionName: 'Details',
      attributeName: parts[0],
      attributeValue: parts[0],
    }
  }
  return null
}

function parseManualDetails(value: unknown): ProductDetailEntry[] {
  return toStringArray(value)
    .map((item) => parseDetailString(item))
    .filter((detail): detail is ProductDetailEntry => Boolean(detail))
}

function buildSpecDetails(specs: ProductSpecification[] | null | undefined): ProductDetailEntry[] {
  if (!Array.isArray(specs)) return []
  return specs
    .map((spec) => {
      const label = toText(spec?.label)
      const val = toText(spec?.value)
      if (!label || !val) return null
      return {
        sectionName: 'Specifications',
        attributeName: label,
        attributeValue: val,
      }
    })
    .filter((detail): detail is ProductDetailEntry => Boolean(detail))
}

function buildAttributeDetails(attrs: ProductAttribute[] | null | undefined): ProductDetailEntry[] {
  if (!Array.isArray(attrs)) return []
  return attrs
    .map((attr) => {
      const name = toText(attr?.name)
      const value = toText(attr?.value)
      if (!name || !value) return null
      return {
        sectionName: 'Attributes',
        attributeName: name,
        attributeValue: value,
      }
    })
    .filter((detail): detail is ProductDetailEntry => Boolean(detail))
}

function uniqueDetails(details: ProductDetailEntry[]): ProductDetailEntry[] {
  const seen = new Set<string>()
  const result: ProductDetailEntry[] = []
  details.forEach((detail) => {
    const key = [detail.sectionName, detail.attributeName, detail.attributeValue]
      .map((part) => normalizeKey(part))
      .join('|')
    if (seen.has(key)) return
    seen.add(key)
    result.push(detail)
  })
  return result
}

function findAttributeValue(
  attrs: ProductAttribute[] | null | undefined,
  names: string[],
): string | undefined {
  if (!Array.isArray(attrs)) return undefined
  const lookup = names.map((name) => name.toLowerCase())
  for (const attr of attrs) {
    const attrName = toText(attr?.name)
    if (!attrName) continue
    const normalized = normalizeKey(attrName)
    if (!lookup.includes(normalized)) continue
    const value = toText(attr?.value)
    if (value) return value
  }
  return undefined
}

function findSpecValue(
  specs: ProductSpecification[] | null | undefined,
  names: string[],
): string | undefined {
  if (!Array.isArray(specs)) return undefined
  const lookup = names.map((name) => name.toLowerCase())
  for (const spec of specs) {
    const label = toText(spec?.label)
    if (!label) continue
    const normalized = normalizeKey(label)
    if (!lookup.includes(normalized)) continue
    const value = toText(spec?.value)
    if (value) return value
  }
  return undefined
}

function extractOptionColors(options: ProductOptionSet[] | null | undefined): string[] {
  if (!Array.isArray(options)) return []
  const colors: string[] = []
  options.forEach((option) => {
    if (option?._type !== 'customProductOption.color') return
    const optionColors = Array.isArray(option?.colors) ? option.colors : []
    optionColors.forEach((color) => {
      const title = toText((color as ProductOptionColor)?.title)
      if (title) colors.push(title)
    })
  })
  return uniqueStrings(colors)
}

function extractOptionSizes(options: ProductOptionSet[] | null | undefined): string[] {
  if (!Array.isArray(options)) return []
  const sizes: string[] = []
  options.forEach((option) => {
    if (option?._type !== 'customProductOption.size') return
    const optionSizes = Array.isArray(option?.sizes) ? option.sizes : []
    optionSizes.forEach((size) => {
      const title = toText((size as ProductOptionSize)?.title)
      if (title) sizes.push(title)
    })
  })
  return uniqueStrings(sizes)
}

function parseList(value: string | undefined): string[] {
  if (!value) return []
  const pieces = value
    .split(/[;,/|]/)
    .map((part) => toText(part))
    .filter((part): part is string => Boolean(part))
  if (pieces.length > 0) return uniqueStrings(pieces)
  return [value]
}

function normalizeUnit(unit?: string): string | undefined {
  if (!unit) return undefined
  const normalized = unit.trim().toLowerCase()
  const mapped = DIMENSION_UNITS[normalized]
  return mapped ?? unit.trim()
}

function formatDimensionValue(value?: string, unit?: string): string | undefined {
  if (!value) return undefined
  const normalizedUnit = normalizeUnit(unit)
  return normalizedUnit ? `${value} ${normalizedUnit}` : value
}

function parseBoxDimensions(value: unknown): ParsedBoxDimensions {
  const text = toText(value)
  if (!text) return {}

  const parts = text
    .split(/[x×]/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length < 2) return {}

  const parsed = parts.map((part) => {
    const match = part.match(/(\d+(?:\.\d+)?)(?:\s*(in(?:ches)?|cm|mm|ft|m))?/i)
    if (!match) return null
    const [, numeric, unit] = match
    return {value: numeric, unit: normalizeUnit(unit)}
  })

  if (parsed.some((segment) => segment === null)) return {}

  const firstUnit = parsed.find((segment) => segment?.unit)?.unit

  const length = parsed[0]
    ? formatDimensionValue(parsed[0]!.value, parsed[0]!.unit || firstUnit)
    : undefined
  const width = parsed[1]
    ? formatDimensionValue(parsed[1]!.value, parsed[1]!.unit || firstUnit)
    : undefined
  const height = parsed[2]
    ? formatDimensionValue(parsed[2]!.value, parsed[2]!.unit || firstUnit)
    : undefined

  return {length, width, height}
}

function deriveColor(source: ProductFeedSource): {color?: string; colorValues: string[]} {
  const manual = toText(source.color)
  const manualList = manual ? parseList(manual) : []
  const attr = findAttributeValue(source.attributes ?? null, COLOR_NAMES)
  const attrList = attr ? parseList(attr) : []
  const optionList = extractOptionColors(source.options ?? null)
  const combined = uniqueStrings([...manualList, ...attrList, ...optionList])
  const fallback = manual || attr || combined[0]
  const color = combined.length > 0 ? combined.join(', ') : fallback
  return {
    color,
    colorValues: combined,
  }
}

function deriveSizes(source: ProductFeedSource): string[] {
  const manual = toText(source.size)
  const manualList = manual ? parseList(manual) : []
  const attr = findAttributeValue(source.attributes ?? null, SIZE_NAMES)
  const attrList = attr ? parseList(attr) : []
  const optionList = extractOptionSizes(source.options ?? null)
  return uniqueStrings([...manualList, ...attrList, ...optionList])
}

function deriveMaterial(source: ProductFeedSource): string | undefined {
  return (
    toText(source.material) ||
    findAttributeValue(source.attributes ?? null, MATERIAL_NAMES) ||
    findSpecValue(source.specifications ?? null, MATERIAL_NAMES)
  )
}

function deriveLength(source: ProductFeedSource, box: ParsedBoxDimensions): string | undefined {
  return (
    toText(source.productLength) ||
    findAttributeValue(source.attributes ?? null, LENGTH_NAMES) ||
    findSpecValue(source.specifications ?? null, LENGTH_NAMES) ||
    box.length
  )
}

function deriveWidth(source: ProductFeedSource, box: ParsedBoxDimensions): string | undefined {
  return (
    toText(source.productWidth) ||
    findAttributeValue(source.attributes ?? null, WIDTH_NAMES) ||
    findSpecValue(source.specifications ?? null, WIDTH_NAMES) ||
    box.width
  )
}

function buildHighlights(source: ProductFeedSource): string[] {
  const manual = toStringArray(source.productHighlights)
  const attributeHighlights = Array.isArray(source.attributes)
    ? source.attributes
        .map((attr) => {
          const name = toText(attr?.name)
          const value = toText(attr?.value)
          if (name && value) return `${name}: ${value}`
          return value || undefined
        })
        .filter((item): item is string => Boolean(item))
    : []
  const specHighlights = Array.isArray(source.specifications)
    ? source.specifications
        .map((spec) => {
          const label = toText(spec?.label)
          const value = toText(spec?.value)
          if (label && value) return `${label}: ${value}`
          return value || undefined
        })
        .filter((item): item is string => Boolean(item))
    : []

  return uniqueStrings([...manual, ...attributeHighlights, ...specHighlights])
    .map((item) => truncate(item, MAX_HIGHLIGHT_LENGTH))
    .slice(0, 10)
}

function buildDetails(source: ProductFeedSource): ProductDetailEntry[] {
  const manual = parseManualDetails(source.productDetails)
  const specs = buildSpecDetails(source.specifications)
  const attrs = buildAttributeDetails(source.attributes)

  return uniqueDetails([...manual, ...specs, ...attrs]).slice(0, MAX_DETAILS)
}

export function deriveProductFeedFields(source: ProductFeedSource): DerivedProductFeedFields {
  const highlights = buildHighlights(source)
  const details = buildDetails(source)
  const colorResult = deriveColor(source)
  const sizes = deriveSizes(source)
  const material = deriveMaterial(source)
  const boxDimensions = parseBoxDimensions(source.boxDimensions)
  const productLength = deriveLength(source, boxDimensions)
  const productWidth = deriveWidth(source, boxDimensions)

  return {
    highlights,
    details,
    color: colorResult.color,
    colorValues: colorResult.colorValues,
    sizes,
    material,
    productLength,
    productWidth,
  }
}

export function formatProductDetail(detail: ProductDetailEntry): string {
  const section = condenseWhitespace(detail.sectionName)
  const attribute = condenseWhitespace(detail.attributeName)
  const value = condenseWhitespace(detail.attributeValue)
  return `${section}: ${attribute}: ${value}`
}

export function detailsToStrings(details: ProductDetailEntry[]): string[] {
  return details.map((detail) => formatProductDetail(detail))
}
