import React from 'react'
import {Badge, Card, Flex, Stack, Text} from '@sanity/ui'

type OrderDocument = {
  paymentCaptureStrategy?: 'auto' | 'manual'
  paymentCaptured?: boolean
  fulfillment?: {
    status?: string
    trackingNumber?: string
    labelUrl?: string
  }
}

type FulfillmentStatusProps = {
  value?: OrderDocument | null
  document?: OrderDocument | null
}

const statusLabel = (status?: string) => {
  if (!status) return {label: 'Unfulfilled', tone: 'caution' as const}
  switch (status) {
    case 'awaiting_capture':
      return {label: 'Awaiting Payment Capture', tone: 'caution' as const}
    case 'ready_to_ship':
      return {label: 'Ready to Ship', tone: 'primary' as const}
    case 'label_created':
      return {label: 'Label Created', tone: 'positive' as const}
    case 'shipped':
      return {label: 'Shipped', tone: 'positive' as const}
    case 'delivered':
      return {label: 'Delivered', tone: 'positive' as const}
    default:
      return {label: status.replace(/_/g, ' '), tone: 'default' as const}
  }
}

export function OrderFulfillmentStatus(props: FulfillmentStatusProps) {
  const order = props.document || props.value
  if (!order) return null

  const captureStrategy = (order.paymentCaptureStrategy || 'auto') as 'auto' | 'manual'
  const isManual = captureStrategy === 'manual'
  const paymentCaptured = Boolean(order.paymentCaptured)
  const fulfillmentState = order.fulfillment?.status
  const trackingNumber = order.fulfillment?.trackingNumber
  const hasLabel = Boolean(order.fulfillment?.labelUrl)

  const paymentBadge = isManual
    ? paymentCaptured
      ? {tone: 'positive' as const, label: 'Manual – Captured'}
      : {tone: 'caution' as const, label: 'Manual – Awaiting Capture'}
    : {tone: 'positive' as const, label: 'Auto-Captured'}

  const fulfillmentBadge = statusLabel(fulfillmentState)

  return (
    <Card padding={4} radius={2} shadow={1}>
      <Stack space={4}>
        <Text size={2} weight="semibold">
          Fulfillment Status
        </Text>

        <Flex gap={3} align="center">
          <Text size={1} muted>
            Payment:
          </Text>
          <Badge tone={paymentBadge.tone}>{paymentBadge.label}</Badge>
        </Flex>

        <Flex gap={3} align="center">
          <Text size={1} muted>
            Fulfillment:
          </Text>
          <Badge tone={fulfillmentBadge.tone}>{fulfillmentBadge.label}</Badge>
        </Flex>

        {trackingNumber ? (
          <Flex gap={3} align="center">
            <Text size={1} muted>
              Tracking:
            </Text>
            <Text size={1} weight="medium">
              {trackingNumber}
            </Text>
          </Flex>
        ) : null}

        {!paymentCaptured && isManual ? (
          <Card padding={3} radius={2} tone="caution">
            <Text size={1}>Capture payment before purchasing a label.</Text>
          </Card>
        ) : null}

        {paymentCaptured && !hasLabel ? (
          <Card padding={3} radius={2} tone="primary">
            <Text size={1}>Ready to purchase shipping label.</Text>
          </Card>
        ) : null}
      </Stack>
    </Card>
  )
}
