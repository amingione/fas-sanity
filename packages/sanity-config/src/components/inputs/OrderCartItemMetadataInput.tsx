import {useEffect, useMemo} from 'react'
import {Badge, Card, Flex, Stack, Text} from '@sanity/ui'
import {ArrayOfObjectsInputProps, PatchEvent, set, unset} from 'sanity'
import {normalizeMetadataEntries} from '../../utils/cartItemDetails'

type MetadataEntry = {
  _key: string
  _type?: string
  key?: string
  value?: string
  source?: string
}

type MetadataValue =
  | Array<Partial<MetadataEntry> | Record<string, unknown> | null | undefined>
  | Record<string, unknown>
  | null
  | undefined

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
      if (Array.isArray(val)) {
        return val
          .filter((entry): entry is Partial<MetadataEntry> | Record<string, unknown> => Boolean(entry))
          .map((entry) => {
            const candidate = entry as Partial<MetadataEntry>
            const key =
              'key' in candidate && typeof candidate.key === 'string'
                ? candidate.key
                : undefined
            const value =
              'value' in candidate && typeof candidate.value === 'string'
                ? candidate.value
                : undefined
            const source =
              'source' in candidate && typeof candidate.source === 'string'
                ? candidate.source
                : undefined
            return {
              _key: candidate._key || generateKey(),
              _type: candidate._type || 'orderCartItemMeta',
              key,
              value,
              source,
            }
          })
      }
      if (val && typeof val === 'object' && Object.keys(val).length) {
        return toMetadataEntries(val as Record<string, unknown>)
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

  const entries = useMemo(() => (Array.isArray(value) ? (value as MetadataEntry[]) : []), [value])

  if (!entries.length) {
    return (
      <Card padding={3} tone="transparent" radius={2} border>
        <Text size={1} muted>
          No metadata available
        </Text>
      </Card>
    )
  }

  return (
    <Stack space={2} paddingY={1}>
      {entries.map((entry) => {
        const key = entry._key || entry.key || generateKey()
        return (
          <Card key={key} padding={3} radius={2} tone="transparent" border>
            <Stack space={2}>
              <Text size={1} weight="semibold">
                {entry.key || 'Untitled'}
              </Text>
              {entry.value && (
                <Text size={1} style={{wordBreak: 'break-word'}}>
                  {entry.value}
                </Text>
              )}
              {entry.source && (
                <Flex>
                  <Badge mode="outline" tone="primary" padding={2} radius={3}>
                    Source: {entry.source}
                  </Badge>
                </Flex>
              )}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}

export default OrderCartItemMetadataInput
