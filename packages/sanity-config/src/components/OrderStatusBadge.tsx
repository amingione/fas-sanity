import {Badge} from '@sanity/ui'
import {
  CheckmarkCircleIcon,
  PackageIcon,
  RefreshIcon,
  LaunchIcon,
  WarningOutlineIcon,
} from '@sanity/icons'
import type {ComponentType} from 'react'
import type {OrderStatus} from '../types/order'

type NormalizedOrderStatus = 'paid' | 'fulfilled' | 'delivered' | 'canceled' | 'refunded'

const STATUS_LABELS: Record<NormalizedOrderStatus, string> = {
  paid: 'Needs Fulfillment',
  fulfilled: 'Fulfilled',
  delivered: 'Delivered',
  canceled: 'Canceled',
  refunded: 'Refunded',
}

const STATUS_ICONS: Partial<Record<NormalizedOrderStatus, ComponentType>> = {
  paid: PackageIcon,
  fulfilled: LaunchIcon,
  delivered: CheckmarkCircleIcon,
  refunded: RefreshIcon,
  canceled: WarningOutlineIcon,
}

const STATUS_COLORS: Record<
  NormalizedOrderStatus,
  {
    background: string
    color: string
    border: string
  }
> = {
  paid: {background: 'rgba(16, 185, 129, 0.15)', color: '#047857', border: '#10b981'},
  fulfilled: {background: 'rgba(59, 130, 246, 0.15)', color: '#1d4ed8', border: '#3b82f6'},
  delivered: {background: 'rgba(34, 197, 94, 0.15)', color: '#15803d', border: '#22c55e'},
  canceled: {background: 'rgba(107, 114, 128, 0.15)', color: '#4b5563', border: '#9ca3af'},
  refunded: {background: 'rgba(251, 191, 36, 0.15)', color: '#92400e', border: '#fbbf24'},
}

const normalizeStatus = (value: OrderStatus): NormalizedOrderStatus => {
  if (value === 'cancelled') return 'canceled'
  if (value === 'shipped') return 'fulfilled'
  return (value as NormalizedOrderStatus) || 'paid'
}

type OrderStatusBadgeProps = {
  status?: OrderStatus | null
}

function OrderStatusBadge({status}: OrderStatusBadgeProps) {
  if (!status) return null
  const normalized = normalizeStatus(status)
  const IconComponent = STATUS_ICONS[normalized]
  const palette = STATUS_COLORS[normalized] ?? STATUS_COLORS.canceled

  return (
    <Badge
      padding={3}
      radius={2}
      tone="default"
      mode="outline"
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        color: palette.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {IconComponent && (
        <span style={{display: 'inline-flex', fontSize: 14}}>
          <IconComponent />
        </span>
      )}
      {STATUS_LABELS[normalized] ?? normalized}
    </Badge>
  )
}

export default OrderStatusBadge
