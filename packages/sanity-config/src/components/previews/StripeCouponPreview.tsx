import React from 'react'
import {Badge, Box, Card, Flex, Stack, Text} from '@sanity/ui'

type StripeCouponPreviewValue = {
  stripeId?: string | null
  name?: string | null
  percentOff?: number | null
  amountOff?: number | null
  currency?: string | null
  duration?: string | null
  durationInMonths?: number | null
  valid?: boolean | null
  redeemBy?: string | null
  maxRedemptions?: number | null
  timesRedeemed?: number | null
  metadata?: Record<string, string> | null
  deletedAt?: string | null
}

type StripeCouponPreviewProps = {
  value?: StripeCouponPreviewValue
}

const formatCurrency = (amount: number, currency?: string | null) => {
  const code = currency ? currency.toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

const formatDiscount = (value?: StripeCouponPreviewValue) => {
  if (!value) return 'Unknown'
  if (typeof value.percentOff === 'number') {
    return `${value.percentOff}% off`
  }
  if (typeof value.amountOff === 'number') {
    return `${formatCurrency(value.amountOff / 100, value.currency)} off`
  }
  return 'Unknown'
}

const formatDuration = (value?: StripeCouponPreviewValue) => {
  const duration = (value?.duration || '').toString()
  if (duration === 'repeating') {
    if (typeof value?.durationInMonths === 'number') {
      return `${value.durationInMonths} months`
    }
    return 'Repeating'
  }
  if (duration === 'once') return 'Once'
  if (duration === 'forever') return 'Forever'
  return 'Unknown'
}

const formatRedemptions = (value?: StripeCouponPreviewValue) => {
  const times = value?.timesRedeemed
  const max = value?.maxRedemptions
  if (typeof times === 'number' && typeof max === 'number') {
    return `${times} / ${max}`
  }
  if (typeof times === 'number') return `${times}`
  return '—'
}

const resolveStatus = (value?: StripeCouponPreviewValue) => {
  if (!value) return {label: 'Unknown', tone: 'default' as const}
  if (value.deletedAt) return {label: 'Deleted', tone: 'critical' as const}
  if (value.valid === false) return {label: 'Expired', tone: 'default' as const}
  if (value.valid === true) return {label: 'Active', tone: 'positive' as const}
  return {label: 'Unknown', tone: 'default' as const}
}

const formatDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'})
}

const StripeCouponPreview = ({value}: StripeCouponPreviewProps) => {
  const status = resolveStatus(value)
  const title = [value?.stripeId, value?.name].filter(Boolean).join(' - ') || 'Stripe Coupon'
  const redeemByLabel = formatDate(value?.redeemBy)
  const metadataEntries = value?.metadata
    ? Object.entries(value.metadata).filter(([key]) => key)
    : []

  return (
    <Card padding={4} radius={3} shadow={1}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Stack space={1}>
            <Text size={2} weight="semibold">
              {title}
            </Text>
            {value?.name ? (
              <Text size={1} muted>
                {value.name}
              </Text>
            ) : null}
          </Stack>
          <Badge tone={status.tone} mode="outline">
            {status.label}
          </Badge>
        </Flex>

        {redeemByLabel ? (
          <Card padding={3} radius={2} tone="caution">
            <Text size={1} weight="semibold">
              Redeem by {redeemByLabel}
            </Text>
          </Card>
        ) : null}

        <Flex wrap="wrap" gap={4}>
          <Box>
            <Text size={1} weight="semibold">
              Discount
            </Text>
            <Text size={1}>{formatDiscount(value)}</Text>
          </Box>
          <Box>
            <Text size={1} weight="semibold">
              Duration
            </Text>
            <Text size={1}>{formatDuration(value)}</Text>
          </Box>
          <Box>
            <Text size={1} weight="semibold">
              Redemptions
            </Text>
            <Text size={1}>{formatRedemptions(value)}</Text>
          </Box>
        </Flex>

        {metadataEntries.length ? (
          <Stack space={2}>
            <Text size={1} weight="semibold">
              Metadata
            </Text>
            <Stack space={1}>
              {metadataEntries.map(([key, val]) => (
                <Text size={1} key={key}>
                  {key}: {val || '—'}
                </Text>
              ))}
            </Stack>
          </Stack>
        ) : (
          <Text size={1} muted>
            No metadata available.
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export default StripeCouponPreview
