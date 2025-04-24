import React from 'react'
import { Badge, Card, Text } from '@sanity/ui'
import type { StringInputProps } from 'sanity'

const fulfillmentColors: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  fulfilled: 'positive',
  unfulfilled: 'caution',
  'in progress': 'default',
  cancelled: 'critical'
}

export default function FulfillmentBadge(props: StringInputProps) {
  const value = props.value
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
      <Badge mode="outline" tone={tone}>
        {value}
      </Badge>
    </Card>
  )
}
