import React from 'react'
import {Badge} from '@sanity/ui'

const statusColors: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  paid: 'positive',
  pending: 'caution',
  refunded: 'default',
  cancelled: 'critical',
}

export default function StatusBadge({value}: {value: string}) {
  if (!value) return null
  const tone = statusColors[value.toLowerCase()] || 'default'
  return <Badge tone={tone}>{value}</Badge>
}
