import {Badge} from '@sanity/ui'
import {CheckmarkCircleIcon, CheckmarkIcon, RefreshIcon, WarningOutlineIcon} from '@sanity/icons'
import type {ComponentType} from 'react'
import type {OrderStatus} from '../types/order'

const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const STATUS_ICONS: Partial<Record<OrderStatus, ComponentType>> = {
  paid: CheckmarkCircleIcon,
  fulfilled: CheckmarkIcon,
  shipped: RefreshIcon,
  refunded: WarningOutlineIcon,
}

const STATUS_COLORS: Record<
  OrderStatus,
  {
    background: string
    color: string
    border: string
  }
> = {
  paid: {background: 'rgba(16, 185, 129, 0.15)', color: '#047857', border: '#10b981'},
  fulfilled: {background: 'rgba(13, 148, 136, 0.15)', color: '#0f766e', border: '#14b8a6'},
  shipped: {background: 'rgba(59, 130, 246, 0.15)', color: '#1d4ed8', border: '#3b82f6'},
  cancelled: {background: 'rgba(107, 114, 128, 0.15)', color: '#4b5563', border: '#9ca3af'},
  refunded: {background: 'rgba(251, 191, 36, 0.15)', color: '#92400e', border: '#fbbf24'},
}

type OrderStatusBadgeProps = {
  status?: OrderStatus | null
}

function OrderStatusBadge({status}: OrderStatusBadgeProps) {
  if (!status) return null
  const IconComponent = STATUS_ICONS[status]
  const palette = STATUS_COLORS[status] ?? STATUS_COLORS.cancelled

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
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

export default OrderStatusBadge
