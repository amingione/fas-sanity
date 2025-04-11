import React from 'react'
import { Badge } from '@sanity/ui'

const fulfillmentColors: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  fulfilled: 'positive',
  unfulfilled: 'caution',
  'in progress': 'default',
  cancelled: 'critical'
}

export default function FulfillmentBadge({ value }: { value: string }) {
  if (!value) return null
  const tone = fulfillmentColors[value.toLowerCase()] || 'default'
  return <Badge tone={tone}>{value}</Badge>
}
