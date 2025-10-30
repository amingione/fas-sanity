import {useEffect, useMemo} from 'react'
import type {ReactNode} from 'react'
import {ArrayOfObjectsInputProps, PatchEvent, set, unset} from 'sanity'
import {normalizeMetadataEntries} from '../../utils/cartItemDetails'
import type {MetadataEntryInput, NormalizedMetadataEntry} from '../../utils/cartItemDetails'

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
  ...inputs: Array<MetadataEntryInput | NormalizedMetadataEntry[]>
): Array<{_key: string; _type: 'orderCartItemMeta'; key: string; value: string; source?: string}> => {
  const entries = inputs.flatMap((input) => normalizeMetadataEntries(input))
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
  productName?: string
  productUrl?: string
  image?: string
  price?: number
  quantity?: number
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  metadata?: ReturnType<typeof buildMetadataEntries>
}

const convertLegacyCartItem = (value: unknown): OrderCartItem | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const source = {...(value as Record<string, unknown>)}

  delete source._type
  delete source._key

  const id = toStringValue(
    consume(source, ['id', 'sanity_product_id', 'productId', 'product_id'])
  )
  const productName = toStringValue(
    consume(source, ['productName', 'product_name', 'stripe_product_name'])
  )
  const name = toStringValue(consume(source, ['name', 'display_name'])) || productName || id
  const productUrl = toStringValue(
    consume(source, ['productUrl', 'product_url', 'url', 'product_path'])
  )
  const image = toStringValue(
    consume(source, ['image', 'product_image', 'imageUrl', 'image_url'])
  )
  const price = toNumberValue(consume(source, ['price', 'unit_price', 'base_price']))
  const quantity = toNumberValue(consume(source, ['quantity', 'qty', 'amount']))
  const optionSummary = toStringValue(
    consume(source, ['optionSummary', 'option_summary', 'options_readable'])
  )
  const optionDetails = toStringArray(
    consume(source, ['optionDetails', 'option_details', 'selected_options'])
  )
  const upgrades = toStringArray(consume(source, ['upgrades', 'upgrade_list']))

  const metadataValues: Array<MetadataEntryInput | NormalizedMetadataEntry[]> = []
  if ('metadata' in source) {
    const metadata = consume(source, ['metadata']) as
      | MetadataEntryInput
      | NormalizedMetadataEntry[]
      | undefined
    if (metadata !== undefined) metadataValues.push(metadata)
  }
  if ('raw_metadata' in source) {
    const rawMetadata = consume(source, ['raw_metadata']) as
      | MetadataEntryInput
      | NormalizedMetadataEntry[]
      | undefined
    if (rawMetadata !== undefined) metadataValues.push(rawMetadata)
  }

  // Remaining fields on `source` should still be surfaced for context
  metadataValues.push(source as MetadataEntryInput)

  const metadata = buildMetadataEntries(...metadataValues)

  const cartItem: OrderCartItem = {
    _type: 'orderCartItem',
    _key: generateKey(),
  }

  if (id) cartItem.id = id
  if (name) cartItem.name = name
  if (productName) cartItem.productName = productName
  if (productUrl) cartItem.productUrl = productUrl
  if (image) cartItem.image = image
  if (typeof price === 'number') cartItem.price = price
  if (typeof quantity === 'number') cartItem.quantity = quantity
  if (optionSummary) cartItem.optionSummary = optionSummary
  if (optionDetails?.length) cartItem.optionDetails = optionDetails
  if (upgrades?.length) cartItem.upgrades = upgrades
  if (metadata.length) cartItem.metadata = metadata

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

type OrderCartItemsInputProps = ArrayOfObjectsInputProps<OrderCartItem>

const OrderCartItemsInput = (props: OrderCartItemsInputProps) => {
  const {value, onChange, renderDefault} = props
  const renderArrayInput = renderDefault as (nextProps: ArrayOfObjectsInputProps<OrderCartItem>) => ReactNode

  const normalized = useMemo(() => normalizeLegacyCartValue(value), [value])

  useEffect(() => {
    if (!value) return
    if (Array.isArray(value)) return

    if (!normalized) {
      onChange(PatchEvent.from(unset()))
      return
    }

    onChange(PatchEvent.from(set(normalized)))
  }, [value, normalized, onChange])

  if (!Array.isArray(value) && normalized) {
    return renderArrayInput({...props, value: normalized})
  }

  return renderArrayInput(props)
}

export default OrderCartItemsInput
