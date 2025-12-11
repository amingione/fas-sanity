import React from 'react'
import {Box, Text} from '@sanity/ui'
import {
  CheckmarkCircleIcon,
  ClockIcon,
  DocumentRemoveIcon,
  RocketIcon,
  SyncIcon,
  WarningOutlineIcon,
} from '@sanity/icons'

type StatusVariant = {
  icon: React.ComponentType
  color: string
  label: string
}

const STATUS_MAP: Record<string, StatusVariant> = {
  delivered: {icon: CheckmarkCircleIcon, color: '#10B981', label: 'Delivered'},
  in_transit: {icon: RocketIcon, color: '#2563EB', label: 'In transit'},
  out_for_delivery: {icon: RocketIcon, color: '#2563EB', label: 'Out for delivery'},
  pre_transit: {icon: ClockIcon, color: '#F59E0B', label: 'Pre-transit'},
  pending: {icon: ClockIcon, color: '#F59E0B', label: 'Pending'},
  processing: {icon: SyncIcon, color: '#7C3AED', label: 'Processing'},
  shipped: {icon: RocketIcon, color: '#2563EB', label: 'Shipped'},
  error: {icon: WarningOutlineIcon, color: '#DC2626', label: 'Error'},
  failure: {icon: WarningOutlineIcon, color: '#DC2626', label: 'Failure'},
  cancelled: {icon: DocumentRemoveIcon, color: '#6B7280', label: 'Cancelled'},
  return_to_sender: {icon: WarningOutlineIcon, color: '#DC2626', label: 'Return'},
}

const DEFAULT_STATUS: StatusVariant = {
  icon: ClockIcon,
  color: '#64748B',
  label: 'Pending',
}

const formatStatus = (status?: string | null) => {
  if (!status) return 'Pending'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const ShipmentStatusIcon = ({status}: {status?: string | null}) => {
  const normalized = status?.toLowerCase() || 'pending'
  const variant = STATUS_MAP[normalized] || DEFAULT_STATUS
  const Icon = variant.icon

  return (
    <Box
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: variant.color,
        padding: '0.25rem',
        textAlign: 'center',
      }}
    >
      <Icon style={{fontSize: '1.5rem'}} />
      <Text size={0} muted>
        {formatStatus(status)}
      </Text>
    </Box>
  )
}
