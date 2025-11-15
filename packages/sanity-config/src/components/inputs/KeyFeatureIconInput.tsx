import {useMemo, type ChangeEvent} from 'react'
import {Card, Select, Stack, Text, TextInput} from '@sanity/ui'
import {set, unset, type StringInputProps} from 'sanity'
import {
  KEY_FEATURE_ICON_OPTIONS,
  type KeyFeatureIconOption,
} from '../../constants/keyFeatureIcons'

const CUSTOM_VALUE = '__custom__'

const toOption = (entry: unknown): KeyFeatureIconOption | null => {
  if (!entry) return null
  if (typeof entry === 'string') {
    return {value: entry, title: entry}
  }
  if (typeof entry === 'object') {
    const record = entry as Record<string, any>
    if (typeof record.value === 'string' && record.value.trim()) {
      return {
        value: record.value,
        title: typeof record.title === 'string' && record.title.trim() ? record.title : record.value,
        description: typeof record.description === 'string' ? record.description : undefined,
      }
    }
  }
  return null
}

const KeyFeatureIconInput = (props: StringInputProps) => {
  const {value, onChange, schemaType} = props

  const options = useMemo<KeyFeatureIconOption[]>(() => {
    const list = (schemaType?.options as {list?: unknown[]})?.list
    if (!Array.isArray(list) || list.length === 0) {
      return KEY_FEATURE_ICON_OPTIONS
    }
    const normalized = list.map(toOption).filter(Boolean) as KeyFeatureIconOption[]
    return normalized.length ? normalized : KEY_FEATURE_ICON_OPTIONS
  }, [schemaType])

  const optionLookup = useMemo(
    () => new Map(options.map((option) => [option.value, option] as const)),
    [options],
  )

  const normalizedValue = typeof value === 'string' ? value : ''
  const selectedOption = normalizedValue ? optionLookup.get(normalizedValue) : undefined
  const selectValue = selectedOption ? selectedOption.value : normalizedValue ? CUSTOM_VALUE : ''

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.currentTarget.value
    if (!next) {
      onChange(unset())
      return
    }
    if (next === CUSTOM_VALUE) {
      // Switching to custom mode keeps the existing string so editors can edit it below.
      return
    }
    onChange(set(next))
  }

  const handleCustomChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value
    if (!next.trim()) {
      onChange(unset())
      return
    }
    onChange(set(next.trim()))
  }

  const helperText =
    selectedOption?.description ||
    'Pick the storefront icon token. Choose “Custom icon” to enter an identifier manually.'

  const showCustomInput = selectValue === CUSTOM_VALUE || (!selectValue && normalizedValue.length > 0)

  return (
    <Stack space={3}>
      <Select value={selectValue} onChange={handlePresetChange}>
        <option value="">Select an icon</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.title}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Custom icon…</option>
      </Select>
      {helperText && (
        <Text size={1} muted>
          {helperText}
        </Text>
      )}
      {showCustomInput && (
        <Card padding={3} radius={2} tone="transparent" border>
          <Stack space={2}>
            <Text size={1} weight="semibold">
              Custom icon identifier
            </Text>
            <TextInput
              value={normalizedValue}
              onChange={handleCustomChange}
              placeholder="Ex: turbo, badge-performance, shield"
            />
            <Text size={1} muted>
              Enter the exact token expected by the storefront icon map.
            </Text>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}

export default KeyFeatureIconInput
