import React from 'react'
import {Badge} from '@sanity/ui'
import {buildWorkflowBadges, resolveWorkflowActionBadge} from '../../../utils/orderWorkflow'

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

const STATUS_CANONICAL_MAP: Record<string, string> = {
  cancelled: 'canceled',
}

const DANGER_STATUSES = new Set([
  'archived',
  'canceled',
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

export const normalizeStatus = (value?: string | null) => {
  if (!value) return ''
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
  if (!normalized) return ''
  return STATUS_CANONICAL_MAP[normalized] || normalized
}

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

export const formatStatusLabel = (value?: string | null): string | null => {
  const normalized = normalizeStatus(value)
  if (!normalized) return null
  return formatBadgeLabel(normalized)
}

export const resolveBadgeTone = (value?: string | null): DocumentBadgeTone => {
  const normalized = normalizeStatus(value)
  if (!normalized) return 'default'
  if (DANGER_STATUSES.has(normalized)) return 'critical'
  if (SUCCESS_STATUSES.has(normalized)) return 'positive'
  if (WARNING_STATUSES.has(normalized)) return 'caution'
  return 'primary'
}

export function resolvePrimaryPaymentStatus({
  paymentStatus,
  stripePaymentIntentStatus,
  useStripeFallback = false,
}: {
  paymentStatus?: string | null
  stripePaymentIntentStatus?: string | null
  useStripeFallback?: boolean
}): string | null {
  if (paymentStatus && paymentStatus.trim()) {
    return paymentStatus
  }
  if (useStripeFallback && stripePaymentIntentStatus && stripePaymentIntentStatus.trim()) {
    return stripePaymentIntentStatus
  }
  return null
}

export type StatusBadgeDescriptor = {
  key: string
  label: string
  tone: DocumentBadgeTone
  title: string
}

export function buildOrderStatusBadges({
  paymentStatus,
  stripePaymentIntentStatus,
  orderStatus,
  labelPurchased,
  shippedAt,
  deliveredAt,
  useStripePaymentFallback = false,
  includeWorkflowBadges = true,
}: {
  paymentStatus?: string | null
  stripePaymentIntentStatus?: string | null
  orderStatus?: string | null
  labelPurchased?: boolean | null
  shippedAt?: string | null
  deliveredAt?: string | null
  includeWorkflowBadges?: boolean
  useStripePaymentFallback?: boolean
}): StatusBadgeDescriptor[] {
  const badges: StatusBadgeDescriptor[] = []
  const normalizedOrder = normalizeStatus(orderStatus)

  // Prioritize overall order status (e.g., cancelled) before payment state.
  if (normalizedOrder === 'canceled' || normalizedOrder === 'cancelled') {
    const normalizedPayment = normalizeStatus(paymentStatus) || normalizeStatus(stripePaymentIntentStatus)
    const paid = normalizedPayment === 'paid' || normalizedPayment === 'succeeded'
    const label = paid ? 'Cancelled/Refunded' : 'Cancelled'
    badges.push({
      key: 'order-status',
      label,
      tone: resolveBadgeTone('canceled'),
      title: paid ? 'Order cancelled and refunded' : 'Order cancelled',
    })
    return badges
  }

  const primaryPaymentStatus = resolvePrimaryPaymentStatus({
    paymentStatus,
    stripePaymentIntentStatus,
    useStripeFallback: useStripePaymentFallback,
  })
  const paymentLabel = formatStatusLabel(primaryPaymentStatus)
  if (paymentLabel) {
    badges.push({
      key: 'payment-status',
      label: paymentLabel,
      tone: resolveBadgeTone(primaryPaymentStatus),
      title: `Payment status: ${paymentLabel}`,
    })
  }

  const normalizedPayment = normalizeStatus(primaryPaymentStatus)
  if (normalizedOrder && normalizedOrder !== normalizedPayment) {
    const fulfillmentLabel = formatStatusLabel(orderStatus)
    if (fulfillmentLabel) {
      badges.push({
        key: 'fulfillment-status',
        label: fulfillmentLabel,
        tone: resolveBadgeTone(orderStatus),
        title: `Order status: ${fulfillmentLabel}`,
      })
    }
  }

  const workflowBadges = buildWorkflowBadges({
    paymentStatus: primaryPaymentStatus,
    labelPurchased,
    shippedAt,
    deliveredAt,
  })
  const actionBadge = resolveWorkflowActionBadge({
    paymentStatus: primaryPaymentStatus,
    labelPurchased,
    shippedAt,
    deliveredAt,
  })
  if (includeWorkflowBadges) {
    workflowBadges.forEach((badge) => {
      badges.push({
        key: badge.key,
        label: badge.label,
        tone: badge.tone,
        title: badge.title,
      })
    })
    if (actionBadge) {
      badges.push({
        key: actionBadge.key,
        label: actionBadge.label,
        tone: actionBadge.tone,
        title: actionBadge.title,
      })
    }
  }

  return badges
}

export function DocumentBadge({label, tone = 'default', title, className}: DocumentBadgeProps) {
  return (
    <Badge tone={tone} mode="outline" title={title} className={className}>
      {label}
    </Badge>
  )
}
