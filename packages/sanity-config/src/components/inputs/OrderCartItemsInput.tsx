import {useEffect, useMemo} from 'react'
import {ArrayOfObjectsInputProps, PatchEvent, set, unset} from 'sanity'
import {
  coerceStringArray,
  deriveOptionsFromMetadata,
  normalizeMetadataEntries,
  sanitizeCartItemName,
  type NormalizedMetadataEntry,
  uniqueStrings,
} from '../../utils/cartItemDetails'

const HAS_RANDOM_UUID = typeof globalThis.crypto?.randomUUID === 'function'

const generateKey = () => {
  if (HAS_RANDOM_UUID) {
    return globalThis.crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

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

const toNumberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    // Only accept valid number strings (integer, float, optional sign, optional exponent)
    const numberPattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/
    if (!numberPattern.test(trimmed)) return undefined
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const toStringArray = (value: unknown): string[] | undefined => {
  if (!value) return undefined
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => toStringValue(entry))
      .filter((entry): entry is string => Boolean(entry))
    return next.length ? next : undefined
  }
  if (typeof value === 'string') {
    try {
      if (value.trim().startsWith('[')) {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          const next = parsed
            .map((entry) => toStringValue(entry))
            .filter((entry): entry is string => Boolean(entry))
          if (next.length) return next
        }
      }
    } catch {
      // ignore json errors
    }
    const segments = value
      .split(/[,;|]/g)
      .map((part) => part.trim())
      .filter(Boolean)
    return segments.length ? segments : undefined
  }
  return undefined
}

const consume = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in source) {
      const value = source[key]
      delete source[key]
      return value
    }
  }
  return undefined
}

const buildMetadataEntries = (
  ...inputs: Array<unknown>
): Array<{
  _key: string
  _type: 'orderCartItemMeta'
  key: string
  value: string
  source?: string
}> => {
  const entries = inputs.flatMap((input) => normalizeMetadataEntries(input as any))
  return entries.map(({key, value}) => ({
    _key: generateKey(),
    _type: 'orderCartItemMeta',
    key,
    value,
    source: 'legacy',
  }))
}

type LegacyCartValue = unknown

type OrderCartItem = {
  _type: 'orderCartItem'
  _key: string
  id?: string
  name?: string
  productUrl?: string
  image?: string
  price?: number
  quantity?: number
  lineTotal?: number
  total?: number
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  productRef?: {_type: 'reference'; _ref: string}
  metadata?: {
    option_summary?: string
    upgrades?: string[]
  }
  metadataEntries?: ReturnType<typeof buildMetadataEntries>
}

const arraysEqual = (a?: string[], b?: string[]) => {
  if (!a?.length && !b?.length) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const normalizeCartItemMetadata = (
  metadataEntries: unknown,
): {
  typed: ReturnType<typeof buildMetadataEntries>
  normalized: NormalizedMetadataEntry[]
  changed: boolean
} => {
  if (!metadataEntries) {
    return {typed: [], normalized: [], changed: false}
  }

  if (Array.isArray(metadataEntries)) {
    let changed = false
    const typed: ReturnType<typeof buildMetadataEntries> = []

    metadataEntries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        changed = true
        return
      }
      const record = entry as Record<string, unknown>
      const key = toStringValue(record.key)
      const value = toStringValue(record.value)
      if (!key || !value) {
        changed = true
        return
      }
      const source = toStringValue(record.source)
      const nextEntry: ReturnType<typeof buildMetadataEntries>[number] = {
        _key:
          typeof record._key === 'string' && record._key ? (record._key as string) : generateKey(),
        _type: 'orderCartItemMeta',
        key,
        value,
      }
      if (source) nextEntry.source = source
      if (typeof record._key !== 'string' || !record._key) changed = true
      if (record._type !== 'orderCartItemMeta') changed = true
      typed.push(nextEntry)
    })

    if (typed.length !== metadataEntries.length) changed = true

    const normalized: NormalizedMetadataEntry[] = typed.map(({key, value}) => ({key, value}))
    return {typed, normalized, changed}
  }

  if (typeof metadataEntries === 'object' && !Array.isArray(metadataEntries)) {
    const typed = buildMetadataEntries(metadataEntries)
    const normalized: NormalizedMetadataEntry[] = typed.map(({key, value}) => ({key, value}))
    return {typed, normalized, changed: typed.length > 0}
  }

  return {typed: [], normalized: [], changed: false}
}

const normalizeCartArrayValue = (value: Array<unknown>): OrderCartItem[] | undefined => {
  let changed = false
  const next: OrderCartItem[] = []

  value.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      changed = true
      return
    }

    const record = item as Record<string, unknown>
    const normalizedItem: OrderCartItem = {
      ...(record as OrderCartItem),
      _type: 'orderCartItem',
    }

    if (typeof normalizedItem.name === 'string') {
      const cleaned = sanitizeCartItemName(normalizedItem.name)
      if (cleaned && cleaned !== normalizedItem.name) {
        normalizedItem.name = cleaned
        changed = true
      }
    }
    if (typeof (normalizedItem as any).productName === 'string') {
      const cleaned = sanitizeCartItemName((normalizedItem as any).productName)
      if (cleaned && (!normalizedItem.name || normalizedItem.name !== cleaned)) {
        normalizedItem.name = cleaned
        changed = true
      }
      delete (normalizedItem as any).productName
      changed = true
    }
    if (Array.isArray((normalizedItem as any).validationIssues)) {
      delete (normalizedItem as any).validationIssues
      changed = true
    }

    if (typeof record._key !== 'string' || !record._key) {
      normalizedItem._key = generateKey()
      changed = true
    }

    const metadataResult = normalizeCartItemMetadata(record.metadataEntries)
    if (metadataResult.changed) {
      normalizedItem.metadataEntries = metadataResult.typed.length
        ? metadataResult.typed
        : undefined
      changed = true
    } else if (Array.isArray(record.metadataEntries)) {
      normalizedItem.metadataEntries = record.metadataEntries as OrderCartItem['metadataEntries']
    } else if (metadataResult.typed.length) {
      normalizedItem.metadataEntries = metadataResult.typed
    } else {
      delete (normalizedItem as any).metadataEntries
    }

    const derivedOptions = deriveOptionsFromMetadata(metadataResult.normalized)
    const existingSummary = toStringValue(record.optionSummary)
    const trimmedSummary = existingSummary?.trim()
    const finalSummary = trimmedSummary || derivedOptions.optionSummary
    if (finalSummary) {
      if (finalSummary !== record.optionSummary) {
        normalizedItem.optionSummary = finalSummary
        changed = true
      }
    } else if (record.optionSummary) {
      delete (normalizedItem as any).optionSummary
      changed = true
    }

    const existingDetails = coerceStringArray(record.optionDetails)
    let combinedDetails = uniqueStrings([...existingDetails, ...derivedOptions.optionDetails])

    // Reclassify any detail entries that are actually upgrades
    const upgradeLabelPattern = /^(upgrade|add-?on|accessory)\s*:\s*/i
    const upgradesFromDetails: string[] = []
    const filteredDetails: string[] = []
    for (const entry of combinedDetails) {
      const trimmed = entry.trim()
      const match = trimmed.match(upgradeLabelPattern)
      if (match) {
        const value = trimmed.replace(upgradeLabelPattern, '').trim()
        if (value) upgradesFromDetails.push(value)
      } else {
        filteredDetails.push(trimmed)
      }
    }
    combinedDetails = filteredDetails

    if (combinedDetails.length) {
      if (!arraysEqual(combinedDetails, existingDetails) || !Array.isArray(record.optionDetails)) {
        normalizedItem.optionDetails = combinedDetails
        changed = true
      } else {
        normalizedItem.optionDetails = record.optionDetails as string[]
      }
    } else if (record.optionDetails) {
      const sanitized = coerceStringArray(record.optionDetails)
      if (sanitized.length) {
        normalizedItem.optionDetails = sanitized
        changed = true
      } else {
        delete (normalizedItem as any).optionDetails
        changed = true
      }
    }

    const existingUpgrades = coerceStringArray(record.upgrades)
    const finalUpgrades = uniqueStrings([
      ...existingUpgrades,
      ...derivedOptions.upgrades,
      ...upgradesFromDetails,
    ])
    if (finalUpgrades.length) {
      if (!arraysEqual(finalUpgrades, existingUpgrades) || !Array.isArray(record.upgrades)) {
        normalizedItem.upgrades = finalUpgrades
        changed = true
      } else {
        normalizedItem.upgrades = record.upgrades as string[]
      }
    } else if (record.upgrades) {
      const sanitized = coerceStringArray(record.upgrades)
      if (sanitized.length) {
        normalizedItem.upgrades = sanitized
        changed = true
      } else {
        delete (normalizedItem as any).upgrades
        changed = true
      }
    }

    const metadataSummaryValue = normalizedItem.optionSummary?.trim()
    const metadataUpgradesValue = normalizedItem.upgrades
      ?.map((entry) => entry.trim())
      .filter(Boolean)
    const nextMetadata =
      metadataSummaryValue || (metadataUpgradesValue && metadataUpgradesValue.length)
        ? {
            option_summary: metadataSummaryValue || undefined,
            upgrades:
              metadataUpgradesValue && metadataUpgradesValue.length
                ? metadataUpgradesValue
                : undefined,
          }
        : undefined

    if (nextMetadata) {
      const existingMetadata = normalizedItem.metadata
      const upgradesChanged = !arraysEqual(existingMetadata?.upgrades, nextMetadata.upgrades)
      if (existingMetadata?.option_summary !== nextMetadata.option_summary || upgradesChanged) {
        normalizedItem.metadata = nextMetadata
        changed = true
      } else if (!existingMetadata) {
        normalizedItem.metadata = nextMetadata
        changed = true
      }
    } else if (normalizedItem.metadata) {
      delete normalizedItem.metadata
      changed = true
    }

    const lineTotal = toNumberValue((record as any).lineTotal)
    if (typeof lineTotal === 'number') {
      normalizedItem.lineTotal = lineTotal
    } else if ('lineTotal' in record) {
      delete (normalizedItem as any).lineTotal
    }

    const total = toNumberValue((record as any).total)
    if (typeof total === 'number') {
      normalizedItem.total = total
    } else if ('total' in record) {
      delete (normalizedItem as any).total
    }

    next.push(normalizedItem)
  })

  if (next.length !== value.length) {
    changed = true
  }

  return changed ? next : undefined
}

const convertLegacyCartItem = (value: unknown): OrderCartItem | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const source = {...(value as Record<string, unknown>)}

  delete source._type
  delete source._key

  const id = toStringValue(consume(source, ['id', 'sanity_product_id', 'productId', 'product_id']))
  const productName = toStringValue(
    consume(source, ['productName', 'product_name', 'stripe_product_name']),
  )
  const name = sanitizeCartItemName(
    toStringValue(consume(source, ['name', 'display_name'])) || productName || id,
  )
  const productUrl = toStringValue(
    consume(source, ['productUrl', 'product_url', 'url', 'product_path']),
  )
  const image = toStringValue(consume(source, ['image', 'product_image', 'imageUrl', 'image_url']))
  const price = toNumberValue(
    consume(source, ['price', 'unit_price', 'original_price', 'default_price']),
  )
  const quantity = toNumberValue(consume(source, ['quantity', 'qty', 'amount']))
  const lineTotal = toNumberValue(
    consume(source, ['lineTotal', 'line_total', 'amount_total', 'amountTotal']),
  )
  const total = toNumberValue(consume(source, ['total', 'item_total', 'itemTotal', 'total_amount']))
  const optionSummary = toStringValue(
    consume(source, ['optionSummary', 'option_summary', 'options_readable']),
  )
  const optionDetails = toStringArray(
    consume(source, ['optionDetails', 'option_details', 'selected_options']),
  )
  const upgrades = toStringArray(consume(source, ['upgrades', 'upgrade_list']))
  const productRefValue = toStringValue(
    consume(source, ['productRef', 'product_ref', 'sanity_product_ref']),
  )

  const metadataValues: unknown[] = []
  if ('metadata' in source) {
    metadataValues.push(consume(source, ['metadata']))
  }
  if ('raw_metadata' in source) {
    metadataValues.push(consume(source, ['raw_metadata']))
  }

  // Remaining fields on `source` should still be surfaced for context
  metadataValues.push(source)

  const metadata = buildMetadataEntries(...metadataValues)

  const cartItem: OrderCartItem = {
    _type: 'orderCartItem',
    _key: generateKey(),
  }

  if (id) cartItem.id = id
  if (name) cartItem.name = name
  if (productUrl) cartItem.productUrl = productUrl
  if (image) cartItem.image = image
  if (typeof price === 'number') cartItem.price = price
  if (typeof quantity === 'number') cartItem.quantity = quantity
  if (typeof lineTotal === 'number') cartItem.lineTotal = lineTotal
  if (typeof total === 'number') cartItem.total = total
  if (optionSummary) cartItem.optionSummary = optionSummary
  if (optionDetails?.length) cartItem.optionDetails = optionDetails
  if (upgrades?.length) cartItem.upgrades = upgrades
  if (productRefValue) {
    cartItem.productRef = {_type: 'reference', _ref: productRefValue}
  }
  if (metadata.length) cartItem.metadataEntries = metadata

  const metadataSummary = cartItem.optionSummary?.trim()
  const metadataUpgrades = cartItem.upgrades?.map((entry) => entry.trim()).filter(Boolean)
  if (metadataSummary || (metadataUpgrades && metadataUpgrades.length)) {
    cartItem.metadata = {
      ...(cartItem.metadata || {}),
      option_summary: metadataSummary || undefined,
      upgrades: metadataUpgrades && metadataUpgrades.length ? metadataUpgrades : undefined,
    }
  }

  if (cartItem.metadata && !cartItem.metadata.option_summary && !cartItem.metadata.upgrades) {
    delete cartItem.metadata
  }

  return cartItem
}

const normalizeLegacyCartValue = (value: LegacyCartValue): OrderCartItem[] | undefined => {
  if (!value) return undefined
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => (Array.isArray(entry) ? undefined : convertLegacyCartItem(entry)))
      .filter((entry): entry is OrderCartItem => Boolean(entry))
    return next.length ? next : undefined
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.items)) {
      const next = record.items
        .map((entry) => convertLegacyCartItem(entry))
        .filter((entry): entry is OrderCartItem => Boolean(entry))
      if (next.length) return next
    }
    if (Array.isArray(record.value)) {
      const next = record.value
        .map((entry) => convertLegacyCartItem(entry))
        .filter((entry): entry is OrderCartItem => Boolean(entry))
      if (next.length) return next
    }
    const single = convertLegacyCartItem(record)
    return single ? [single] : undefined
  }
  return undefined
}

const OrderCartItemsInput = (props: ArrayOfObjectsInputProps<OrderCartItem>) => {
  const {value, onChange, renderDefault, readOnly} = props

  const normalized = useMemo(() => normalizeLegacyCartValue(value), [value])

  useEffect(() => {
    if (readOnly) return
    if (!value) return
    if (Array.isArray(value)) return

    if (!normalized) {
      onChange(PatchEvent.from(unset()))
      return
    }

    onChange(PatchEvent.from(set(normalized)))
  }, [value, normalized, onChange, readOnly])

  useEffect(() => {
    if (readOnly) return
    if (!Array.isArray(value) || !value.length) return
    const sanitized = normalizeCartArrayValue(value)
    if (sanitized) {
      onChange(PatchEvent.from(set(sanitized)))
    }
  }, [value, onChange, readOnly])

  if (!Array.isArray(value) && normalized) {
    return renderDefault({...props, value: normalized} as any)
  }

  return renderDefault(props as any)
}

export default OrderCartItemsInput
