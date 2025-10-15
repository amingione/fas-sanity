import React from 'react'
import { Badge, Card, Text } from '@sanity/ui'
import type { StringInputProps } from 'sanity'

interface Props {
  value: string
  readOnly?: boolean
}

// Shared tone mappings
const fulfillmentColors: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  fulfilled: 'positive',
  unfulfilled: 'caution',
  'in progress': 'default',
  cancelled: 'critical',
  canceled: 'critical',
  paid: 'caution',
  pending: 'default'
}

// Component that works for both input + readonly
export default function FulfillmentBadge(props: StringInputProps | Props) {
  const value = (props as any).value
  const readOnly = (props as any).readOnly ?? false

  if (!value) {
    return (
      <Card padding={3} tone="caution">
        <Text size={1}>No fulfillment status selected</Text>
      </Card>
    )
  }

  const tone = fulfillmentColors[String(value).toLowerCase()] || 'default'

  return (
    <Card padding={3}>
      <Badge mode={readOnly ? 'outline' : 'default'} tone={tone}>
        {value}
      </Badge>
    </Card>
  )
}
