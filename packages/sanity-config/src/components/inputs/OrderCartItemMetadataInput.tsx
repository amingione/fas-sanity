import {useEffect} from 'react'
import {ArrayOfObjectsInputProps, PatchEvent, set, unset} from 'sanity'
import {normalizeMetadataEntries} from '../../utils/cartItemDetails'

type MetadataEntry = {
  _key: string
  _type?: string
  key?: string
  value?: string
  source?: string
}

type MetadataValue = MetadataEntry[] | Record<string, unknown> | null | undefined

const HAS_RANDOM_UUID = typeof globalThis.crypto?.randomUUID === 'function'

const generateKey = () => {
  if (HAS_RANDOM_UUID) {
    return globalThis.crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const toMetadataEntries = (value: Record<string, unknown>): MetadataEntry[] => {
  const normalized = normalizeMetadataEntries(value)
  if (!normalized.length) return []
  return normalized.map(({key, value: entryValue}) => ({
    _key: generateKey(),
    _type: 'orderCartItemMeta',
    key,
    value: entryValue,
    source: 'legacy',
  }))
}

const OrderCartItemMetadataInput = (props: ArrayOfObjectsInputProps<MetadataEntry>) => {
  const {value, onChange} = props

  useEffect(() => {
    const coerceMetadataArray = (val: MetadataValue): MetadataEntry[] | undefined => {
      if (Array.isArray(val)) return val as MetadataEntry[]
      if (val && typeof val === 'object' && Object.keys(val).length) {
        return toMetadataEntries(val)
      }
      return undefined
    }

    if (!value || Array.isArray(value)) return
    if (typeof value !== 'object') {
      onChange(PatchEvent.from(unset()))
      return
    }

    const next = coerceMetadataArray(value as Record<string, unknown>)
    if (!next) {
      onChange(PatchEvent.from(unset()))
      return
    }

    onChange(PatchEvent.from(set(next)))
  }, [value, onChange])

  return null
}

export default OrderCartItemMetadataInput
