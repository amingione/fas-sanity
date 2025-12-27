export type WorkflowBadgeTone = 'default' | 'primary' | 'positive' | 'caution' | 'critical'

export type WorkflowSignals = {
  paymentStatus?: string | null
  labelPurchased?: boolean | null
  shippedAt?: string | null
  deliveredAt?: string | null
}

export type WorkflowBadge = {
  key: string
  label: string
  tone: WorkflowBadgeTone
  title: string
}

export type WorkflowState = {
  key: string
  label: string
  tone: WorkflowBadgeTone
  actionLabel?: string
}

const normalizeStatus = (value?: string | null) =>
  value
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ')
    : ''

const formatStatusLabel = (value?: string | null): string | null => {
  const normalized = normalizeStatus(value)
  if (!normalized) return null
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

const PAYMENT_CONFIRMED = new Set([
  'paid',
  'succeeded',
  'captured',
  'settled',
  'complete',
  'completed',
])

const PAYMENT_FAILED = new Set([
  'failed',
  'canceled',
  'cancelled',
  'refunded',
  'chargeback',
  'void',
])

export const isPaymentConfirmed = (paymentStatus?: string | null) =>
  PAYMENT_CONFIRMED.has(normalizeStatus(paymentStatus))

const isPaymentFailed = (paymentStatus?: string | null) =>
  PAYMENT_FAILED.has(normalizeStatus(paymentStatus))

export const deriveWorkflowState = ({
  paymentStatus,
  labelPurchased,
  shippedAt,
  deliveredAt,
}: WorkflowSignals): WorkflowState => {
  if (deliveredAt) {
    return {key: 'delivered', label: 'Delivered', tone: 'positive'}
  }
  if (shippedAt) {
    return {key: 'shipped', label: 'Shipped', tone: 'positive'}
  }
  if (labelPurchased) {
    return {
      key: 'label-purchased',
      label: 'Label Purchased',
      tone: 'primary',
      actionLabel: 'Ready to ship',
    }
  }
  if (isPaymentConfirmed(paymentStatus)) {
    return {
      key: 'paid-ready',
      label: 'Paid — Ready to Pack',
      tone: 'caution',
      actionLabel: 'Ready to pack',
    }
  }
  if (isPaymentFailed(paymentStatus)) {
    return {
      key: 'payment-issue',
      label: 'Payment Issue',
      tone: 'critical',
      actionLabel: 'Resolve payment',
    }
  }
  const paymentLabel = formatStatusLabel(paymentStatus)
  return {
    key: 'awaiting-payment',
    label: paymentLabel ? `Payment ${paymentLabel}` : 'Awaiting Payment',
    tone: 'critical',
    actionLabel: 'Awaiting payment',
  }
}

export const buildWorkflowBadges = ({
  paymentStatus,
  labelPurchased,
  shippedAt,
  deliveredAt,
}: WorkflowSignals): WorkflowBadge[] => {
  const badges: WorkflowBadge[] = []
  if (isPaymentConfirmed(paymentStatus)) {
    badges.push({
      key: 'payment-confirmed',
      label: 'Payment confirmed',
      tone: 'positive',
      title: 'Payment captured and confirmed',
    })
  }
  if (labelPurchased) {
    badges.push({
      key: 'label-purchased',
      label: 'Label purchased',
      tone: 'primary',
      title: 'Shipping label purchased',
    })
  }
  if (shippedAt) {
    badges.push({
      key: 'shipped',
      label: 'Shipped',
      tone: 'positive',
      title: 'Shipment marked as sent',
    })
  }
  if (deliveredAt) {
    badges.push({
      key: 'delivered',
      label: 'Delivered',
      tone: 'positive',
      title: 'Shipment delivered',
    })
  }
  return badges
}

export const resolveWorkflowActionBadge = (signals: WorkflowSignals): WorkflowBadge | null => {
  const state = deriveWorkflowState(signals)
  if (!state.actionLabel) return null
  return {
    key: `action-${state.key}`,
    label: `Action: ${state.actionLabel}`,
    tone: state.tone === 'positive' ? 'primary' : state.tone,
    title: state.label,
  }
}
