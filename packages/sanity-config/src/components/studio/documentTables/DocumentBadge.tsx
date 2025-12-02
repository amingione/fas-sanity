import React from 'react'
import {Badge} from '@sanity/ui'

export type DocumentBadgeTone = 'default' | 'primary' | 'positive' | 'caution' | 'critical'

export interface DocumentBadgeProps {
  label: string
  tone?: DocumentBadgeTone
  title?: string
  className?: string
}

const SUCCESS_STATUSES = new Set([
  'active',
  'authorized',
  'available',
  'captured',
  'complete',
  'completed',
  'delivered',
  'enabled',
  'fulfilled',
  'live',
  'paid',
  'processed',
  'settled',
  'succeeded',
  'success',
  'synced',
])

const WARNING_STATUSES = new Set([
  'backordered',
  'in progress',
  'in transit',
  'in review',
  'manual',
  'open',
  'partially fulfilled',
  'partially paid',
  'partially refunded',
  'pending',
  'processing',
  'requires action',
  'requires payment',
  'requires payment method',
  'scheduled',
  'unfulfilled',
])

const DANGER_STATUSES = new Set([
  'archived',
  'canceled',
  'cancelled',
  'chargeback',
  'declined',
  'error',
  'errored',
  'failed',
  'fraudulent',
  'inactive',
  'invalid',
  'refunded',
  'void',
])

const normalizeStatus = (value?: string | null) =>
  value
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ')
    : ''

export const formatBadgeLabel = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export const resolveBadgeTone = (value?: string | null): DocumentBadgeTone => {
  const normalized = normalizeStatus(value)
  if (!normalized) return 'default'
  if (DANGER_STATUSES.has(normalized)) return 'critical'
  if (SUCCESS_STATUSES.has(normalized)) return 'positive'
  if (WARNING_STATUSES.has(normalized)) return 'caution'
  return 'primary'
}

export function DocumentBadge({label, tone = 'default', title, className}: DocumentBadgeProps) {
  return (
    <Badge tone={tone} mode="outline" title={title} className={className}>
      {label}
    </Badge>
  )
}
