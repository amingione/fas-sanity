import {Flex, Stack, Text} from '@sanity/ui'
import type {StringInputProps} from 'sanity'

type Props = StringInputProps & {
  maxLength?: number
}

const formatter = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0})

export default function SeoCharacterCountInput(props: Props) {
  const {renderDefault, value, schemaType, maxLength: overrideMax} = props
  const schemaMax =
    typeof schemaType?.options === 'object' && typeof (schemaType.options as any)?.maxLength === 'number'
      ? Number((schemaType.options as any).maxLength)
      : undefined
  const maxLength = overrideMax ?? schemaMax
  const length = typeof value === 'string' ? value.length : 0
  const ratio = maxLength ? length / maxLength : 0
  let colorVar = 'var(--card-muted-fg-color)'
  if (ratio >= 1) colorVar = 'var(--card-critical-fg-color)'
  else if (ratio >= 0.95) colorVar = 'var(--card-caution-fg-color)'
  else if (ratio >= 0.45) colorVar = 'var(--card-accent-fg-color)'

  const counterLabel = maxLength
    ? `${formatter.format(length)} / ${formatter.format(maxLength)} characters`
    : `${formatter.format(length)} character${length === 1 ? '' : 's'}`

  return (
    <Stack space={2}>
      {renderDefault(props)}
      <Flex justify="flex-end">
        <Text size={1} style={{color: colorVar}}>
          {counterLabel}
        </Text>
      </Flex>
    </Stack>
  )
}
