import {Card, Text} from '@sanity/ui'
import type {StringInputProps} from 'sanity'

export default function ReferenceCodeInput(props: StringInputProps) {
  const printable = typeof props.value === 'string' ? props.value.trim() : props.value ?? ''
  return (
    <Card padding={3} radius={2} tone="transparent" border>
      <Text size={2} weight="medium">
        {printable ? printable : '—'}
      </Text>
    </Card>
  )
}
