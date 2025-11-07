export type ProductOptionRequirement = {
  name: string
  required?: boolean | null
}

export type ProductCustomizationRequirement = {
  name: string
  required?: boolean | null
}

export type CartSelection = {
  optionSummary?: string | null
  optionDetails?: string[] | null
  customizations?: string[] | null
}

export type CartValidationIssue = {
  type: 'option' | 'customization'
  field: string
  message: string
}

const UNLABELED_KEY = '__unlabeled__'

const IGNORED_VALUE_PATTERNS = [/^\s*none\s*$/i, /^\s*n\/a\s*$/i, /^\s*no\s*$/i, /^\s*false\s*$/i]

function isMeaningful(value?: string | null): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (IGNORED_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed))) return false
  return true
}

const NORMALIZE_LABEL_PATTERN = /\b(option|selected|selection|value|display|name|field|attribute|choice|custom)\b/gi

function normalizeLabel(label?: string | null): string {
  if (!label) return ''
  return label
    .toLowerCase()
    .replace(NORMALIZE_LABEL_PATTERN, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function parseDetailEntry(detail: string): {label?: string; value?: string} {
  const trimmed = detail.trim()
  if (!trimmed) return {}
  const [rawLabel, ...rest] = trimmed.split(':')
  if (rest.length === 0) {
    return {value: rawLabel.trim()}
  }
  const label = rawLabel.trim()
  const value = rest.join(':').trim()
  return {label, value}
}

function collectOptionSelections(summary?: string | null, details?: string[] | null) {
  const map = new Map<string, string[]>()
  const ensureKey = (key: string) => {
    if (!map.has(key)) map.set(key, [])
    return map.get(key)!
  }

  const register = (entry: {label?: string; value?: string}) => {
    const labelKey = normalizeLabel(entry.label)
    if (labelKey) {
      ensureKey(labelKey).push(entry.value || '')
    } else if (entry.value) {
      ensureKey(UNLABELED_KEY).push(entry.value)
    }
  }

  if (summary) {
    summary
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseDetailEntry)
      .forEach(register)
  }

  if (Array.isArray(details)) {
    details
      .flatMap((detail) =>
        detail
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .map(parseDetailEntry),
      )
      .forEach(register)
  }

  return map
}

function collectCustomizationSelections(list?: string[] | null) {
  const map = new Map<string, string[]>()
  if (!Array.isArray(list)) return map
  list
    .flatMap((detail) =>
      detail
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map(parseDetailEntry),
    )
    .forEach((entry) => {
      const label = normalizeLabel(entry.label)
      if (label) {
        const values = map.get(label) || []
        values.push(entry.value || '')
        map.set(label, values)
      }
    })
  return map
}

function optionIsSatisfied(
  option: ProductOptionRequirement,
  selections: Map<string, string[]>,
  totalRequiredOptions: number,
): boolean {
  const normalizedName = normalizeLabel(option.name)
  if (!normalizedName) return true
  const values = selections.get(normalizedName)
  if (values && values.some((value) => isMeaningful(value))) {
    return true
  }
  const unlabeled = selections.get(UNLABELED_KEY) || []
  if (unlabeled.length && totalRequiredOptions === 1) {
    return unlabeled.some((value) => isMeaningful(value))
  }
  return false
}

function customizationIsSatisfied(
  customization: ProductCustomizationRequirement,
  selections: Map<string, string[]>,
): boolean {
  const normalizedName = normalizeLabel(customization.name)
  if (!normalizedName) return true
  const values = selections.get(normalizedName) || []
  return values.some((value) => isMeaningful(value))
}

export function validateCartSelections(
  context: {
    productTitle?: string | null
    options?: ProductOptionRequirement[] | null
    customizations?: ProductCustomizationRequirement[] | null
  },
  selection: CartSelection,
): CartValidationIssue[] {
  const issues: CartValidationIssue[] = []
  const requiredOptions = (context.options || []).filter((option) => option?.name && option.required !== false)
  const optionSelections = collectOptionSelections(selection.optionSummary, selection.optionDetails)

  const totalRequiredOptions = requiredOptions.length
  requiredOptions.forEach((option) => {
    if (!option.name) return
    if (optionIsSatisfied(option, optionSelections, totalRequiredOptions)) return
    issues.push({
      type: 'option',
      field: option.name,
      message: `Missing selection for ${option.name}`,
    })
  })

  const requiredCustomizations = (context.customizations || []).filter(
    (customization) => customization?.name && customization.required,
  )
  if (requiredCustomizations.length) {
    const customizationSelections = collectCustomizationSelections(selection.customizations)
    requiredCustomizations.forEach((customization) => {
      if (!customization.name) return
      if (customizationIsSatisfied(customization, customizationSelections)) return
      issues.push({
        type: 'customization',
        field: customization.name,
        message: `Missing customization: ${customization.name}`,
      })
    })
  }

  return issues
}

export function hasBlockingSelectionIssues(
  context: {
    productTitle?: string | null
    options?: ProductOptionRequirement[] | null
    customizations?: ProductCustomizationRequirement[] | null
  },
  selection: CartSelection,
): boolean {
  return validateCartSelections(context, selection).length > 0
}

type SelectionRecord = Record<string, unknown> | null | undefined

function toMeaningfulStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toMeaningfulStrings(entry)).filter((entry) => isMeaningful(entry))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('value' in record) {
      return toMeaningfulStrings(record.value)
    }
    if ('label' in record) {
      return toMeaningfulStrings(record.label)
    }
    if ('title' in record) {
      return toMeaningfulStrings(record.title)
    }
  }

  if (typeof value === 'string') {
    return isMeaningful(value) ? [value.trim()] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value)
    return isMeaningful(text) ? [text] : []
  }

  return []
}

function buildDetailLines(map?: SelectionRecord, fallbackKey?: string): string[] {
  if (!map) return []

  const entries = Object.entries(map)
    .map(([label, rawValue]) => {
      const values = toMeaningfulStrings(rawValue)
      if (!values.length) return null

      const trimmedLabel = String(label).trim()
      if (!trimmedLabel && !fallbackKey) {
        return values
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => `${value}`)
      }

      const effectiveLabel = trimmedLabel || fallbackKey || ''
      return [`${effectiveLabel}: ${values.join(', ')}`]
    })
    .filter((entry): entry is string[] => Array.isArray(entry) && entry.length > 0)

  return entries.flat()
}

export function buildCartSelectionFromMaps(
  options?: SelectionRecord,
  customizations?: SelectionRecord,
): CartSelection {
  const optionDetails = buildDetailLines(options, 'Option')
  const customDetailLines = buildDetailLines(customizations)

  return {
    optionSummary: optionDetails.length ? optionDetails.join(', ') : undefined,
    optionDetails: optionDetails.length ? optionDetails : undefined,
    customizations: customDetailLines.length ? customDetailLines : undefined,
  }
}
