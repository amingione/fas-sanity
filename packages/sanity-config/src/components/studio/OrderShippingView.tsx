// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React, {useCallback, useMemo, useState} from 'react'
import {Badge, Box, Card, Flex, Grid, Heading, Stack, Text, Tooltip, Button} from '@sanity/ui'
import {DownloadIcon, EnvelopeIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'
import {formatOrderNumber} from '../../utils/orderNumber'
import {resolveNetlifyBase} from '../../utils/netlifyBase'
import {
  buildWorkflowBadges,
  deriveWorkflowState,
  resolveWorkflowActionBadge,
} from '../../utils/orderWorkflow'

type DocumentViewProps = {
  document?: {
    displayed?: OrderDocument | null
  }
}

type OrderDocument = {
  _id: string
  orderNumber?: string
  customerName?: string
  customerEmail?: string
  customerRef?: {_ref: string}
  status?: string
  paymentStatus?: string
  labelPurchased?: boolean
  labelCost?: number
  deliveryDays?: number
  shippedAt?: string
  deliveredAt?: string
  confirmationEmailSent?: boolean
  totalAmount?: number
  amountShipping?: number
  currency?: string
  createdAt?: string
  packingSlipUrl?: string
  stripeSessionId?: string
  fulfillment?: {
    carrier?: string
    service?: string
    deliveryDays?: number
    estimatedDeliveryDate?: string
    trackingNumber?: string
    trackingUrl?: string
  } | null
  shippingLabelUrl?: string
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  service?: string
  estimatedDeliveryDate?: string
  shippingAddress?: {
    name?: string
    phone?: string
    email?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  shippingLog?: Array<{
    _key?: string
    status?: string
    message?: string
    trackingNumber?: string
    trackingUrl?: string
    createdAt?: string
  }>
}

const STATUS_META: Record<
  string,
  {
    label: string
    tone: 'default' | 'positive' | 'critical' | 'caution'
  }
> = {
  paid: {label: 'Paid', tone: 'positive'},
  fulfilled: {label: 'Fulfilled', tone: 'positive'},
  shipped: {label: 'Shipped', tone: 'positive'},
  cancelled: {label: 'Cancelled', tone: 'critical'},
  refunded: {label: 'Refunded', tone: 'caution'},
  closed: {label: 'Closed', tone: 'default'},
  expired: {label: 'Expired', tone: 'default'},
}

const PAYMENT_META: Record<
  string,
  {
    label: string
    tone: 'default' | 'positive' | 'critical' | 'caution'
  }
> = {
  succeeded: {label: 'Succeeded', tone: 'positive'},
  paid: {label: 'Paid', tone: 'positive'},
  processing: {label: 'Processing', tone: 'caution'},
  cancelled: {label: 'Cancelled', tone: 'critical'},
  failed: {label: 'Failed', tone: 'critical'},
  refunded: {label: 'Refunded', tone: 'caution'},
}

const SHIPPING_META: Record<
  string,
  {
    label: string
    tone: 'default' | 'positive' | 'critical' | 'caution'
  }
> = {
  label_created: {label: 'Label created', tone: 'positive'},
  fulfilled: {label: 'Fulfilled', tone: 'positive'},
  shipped: {label: 'Shipped', tone: 'positive'},
  delivered: {label: 'Delivered', tone: 'positive'},
  exception: {label: 'Exception', tone: 'critical'},
}

const formatCurrency = (value?: number, currency = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

const formatDate = (value?: string) => {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const buildAddress = (address?: OrderDocument['shippingAddress']) => {
  if (!address) return '—'
  const rows = [
    address.name,
    address.email,
    address.phone,
    [address.addressLine1, address.addressLine2].filter(Boolean).join(', '),
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ]
    .map((row) => (row || '').trim())
    .filter(Boolean)
  return rows.length ? rows.join('\n') : '—'
}

const resolvePatchTargets = (rawId?: string) => {
  if (!rawId) return []
  const id = rawId.trim()
  if (!id) return []
  const published = id.replace(/^drafts\./, '')
  return published && published !== id ? [id, published] : [id]
}

const getFnBase = (): string => resolveNetlifyBase()

async function openUrl(url: string) {
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    window.location.href = url
  }
}

export default function OrderShippingView(props: DocumentViewProps) {
  const order = props.document?.displayed || null
  const client = useClient({apiVersion: '2024-10-01'})
  const [downloadingSlip, setDownloadingSlip] = useState(false)
  const base = getFnBase()
  const orderId = order?._id || ''

  const patchTargets = useMemo(() => resolvePatchTargets(orderId), [orderId])

  const ensurePackingSlip = useCallback(async () => {
    if (!order || downloadingSlip) return
    setDownloadingSlip(true)
    try {
      if (order.packingSlipUrl) {
        await openUrl(order.packingSlipUrl)
        return
      }

      const payload: Record<string, any> = {}
      if (order._id) payload.orderId = order._id.replace(/^drafts\./, '')
      if (order.stripeSessionId) payload.stripeSessionId = order.stripeSessionId

      const response = await fetch(`${base}/.netlify/functions/generatePackingSlips`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      let buffer: ArrayBuffer
      if (contentType.includes('application/pdf')) {
        buffer = await response.arrayBuffer()
      } else {
        const base64 = (await response.text()).replace(/^"|"$/g, '')
        buffer = decodeBase64ToArrayBuffer(base64)
      }
      const blob = new Blob([buffer], {type: 'application/pdf'})

      const orderRefForFile = formatOrderNumber(order.orderNumber) || 'order'
      const filenameSafe = orderRefForFile.replace(/[^a-z0-9_-]/gi, '') || 'order'

      const asset = await client.assets.upload('file', blob, {
        filename: `packing-slip-${filenameSafe}.pdf`,
        contentType: 'application/pdf',
      })
      const url = (asset as any)?.url
      if (!url) throw new Error('Unable to store packing slip asset')

      await Promise.all(
        patchTargets.map((targetId) =>
          client.patch(targetId).set({packingSlipUrl: url}).commit({autoGenerateArrayKeys: true}),
        ),
      )

      await openUrl(url)
    } catch (err: any) {
      console.error('Packing slip download failed', err)
      alert(err?.message || 'Unable to prepare packing slip.')
    } finally {
      setDownloadingSlip(false)
    }
  }, [base, client, downloadingSlip, order, patchTargets])

  const handleEmailCustomer = useCallback(() => {
    const customerEmail = order?.customerEmail
    if (!customerEmail) return
    const orderRef =
      formatOrderNumber(order?.orderNumber) || orderId.replace(/^drafts\./, '') || orderId
    const subject = encodeURIComponent(`Order ${orderRef}`)
    const body = encodeURIComponent(
      [
        `Hi ${order?.customerName || ''},`,
        '',
        'We wanted to follow up on your recent order. Let us know if you have any questions.',
        '',
        '— F.A.S. Motorsports',
      ].join('\n'),
    )
    window.location.href = `mailto:${customerEmail}?subject=${subject}&body=${body}`
  }, [order, orderId])

  if (!order) {
    return (
      <Card padding={4}>
        <Text>No order data available.</Text>
      </Card>
    )
  }

  const statusMeta = STATUS_META[order.status || ''] || {
    label: order.status || 'Unknown',
    tone: 'default' as const,
  }
  const paymentMeta = PAYMENT_META[(order.paymentStatus || '').toLowerCase()] || {
    label: order.paymentStatus || 'Unknown',
    tone: 'default' as const,
  }

  const shippingLog = Array.isArray(order.shippingLog) ? order.shippingLog : []
  const orderRefLabel = formatOrderNumber(order.orderNumber) || 'Not assigned'
  const trackingNumber = order.trackingNumber || order.fulfillment?.trackingNumber || ''
  const trackingUrl = order.trackingUrl || order.fulfillment?.trackingUrl || ''
  const workflowState = deriveWorkflowState({
    paymentStatus: order.paymentStatus,
    labelPurchased: order.labelPurchased,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
  })
  const workflowBadges = buildWorkflowBadges({
    paymentStatus: order.paymentStatus,
    labelPurchased: order.labelPurchased,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
  })
  const actionBadge = resolveWorkflowActionBadge({
    paymentStatus: order.paymentStatus,
    labelPurchased: order.labelPurchased,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
  })
  const trackingEmailSent = shippingLog.some(
    (entry) => (entry?.status || '').trim().toLowerCase() === 'notified',
  )

  return (
    <Stack space={4} padding={4}>
      <Card padding={4} radius={4} shadow={1}>
        <Flex align={['flex-start', 'center']} justify="space-between" wrap="wrap" gap={3}>
          <Stack space={2}>
            <Heading size={3}>Order {orderRefLabel}</Heading>
            <Flex gap={2} wrap="wrap">
              <Badge tone={statusMeta.tone} mode="outline" fontSize={0}>
                {statusMeta.label}
              </Badge>
              <Badge tone={paymentMeta.tone} mode="outline" fontSize={0}>
                {paymentMeta.label}
              </Badge>
              <Badge tone={workflowState.tone} mode="outline" fontSize={0}>
                {workflowState.label}
              </Badge>
              {trackingNumber && (
                <Badge tone="positive" mode="outline" fontSize={0}>
                  Tracking ready
                </Badge>
              )}
            </Flex>
            <Flex gap={2} wrap="wrap">
              {workflowBadges.map((badge) => (
                <Badge key={badge.key} tone={badge.tone} mode="outline" fontSize={0}>
                  {badge.label}
                </Badge>
              ))}
              {actionBadge && (
                <Badge tone={actionBadge.tone} mode="outline" fontSize={0}>
                  {actionBadge.label}
                </Badge>
              )}
              <Badge
                tone={order.confirmationEmailSent ? 'positive' : 'caution'}
                mode="outline"
                fontSize={0}
              >
                {order.confirmationEmailSent ? 'Order confirmation sent' : 'Order confirmation pending'}
              </Badge>
              <Badge tone={trackingEmailSent ? 'positive' : 'default'} mode="outline" fontSize={0}>
                {trackingEmailSent ? 'Tracking email sent' : 'Tracking email not recorded'}
              </Badge>
            </Flex>
            <Text muted size={1}>
              Created {formatDate(order.createdAt) || '—'}
            </Text>
          </Stack>

          <Flex gap={2}>
            <Tooltip
              content={
                <Card padding={2}>
                  <Text size={1}>Print packing slip</Text>
                </Card>
              }
            >
              <Button
                icon={DownloadIcon}
                text="Packing slip"
                mode="ghost"
                tone="primary"
                loading={downloadingSlip}
                disabled={downloadingSlip}
                onClick={ensurePackingSlip}
              />
            </Tooltip>
            <Tooltip
              content={
                <Card padding={2}>
                  <Text size={1}>Print shipping label</Text>
                </Card>
              }
            >
              <Button
                icon={DownloadIcon}
                text="Shipping label"
                mode="ghost"
                tone="primary"
                disabled={!order.shippingLabelUrl}
                onClick={() => {
                  if (order.shippingLabelUrl) {
                    openUrl(order.shippingLabelUrl)
                  }
                }}
              />
            </Tooltip>
            <Tooltip
              content={
                <Card padding={2}>
                  <Text size={1}>Email customer</Text>
                </Card>
              }
            >
              <Button
                icon={EnvelopeIcon}
                text="Email"
                mode="ghost"
                tone="primary"
                disabled={!order.customerEmail}
                onClick={handleEmailCustomer}
              />
            </Tooltip>
          </Flex>
        </Flex>
      </Card>

      <Grid columns={[1, 1, 2]} gap={4}>
        <Card padding={4} radius={4} shadow={1} tone="default">
          <Stack space={3}>
            <Heading size={2}>Shipping service</Heading>
            <Grid columns={[1, 1, 2]} gap={3}>
              <Stack space={1}>
                <Text muted size={1}>
                  Carrier
                </Text>
                <Text>{order.carrier || order.fulfillment?.carrier || '—'}</Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Service
                </Text>
                <Text>{order.service || order.fulfillment?.service || '—'}</Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Rate
                </Text>
                <Text>
                  {formatCurrency(order.amountShipping, order.currency || 'USD')}
                </Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Delivery
                </Text>
                <Text>
                  {typeof order.deliveryDays === 'number'
                    ? `${order.deliveryDays} days`
                    : order.estimatedDeliveryDate
                      ? formatDate(order.estimatedDeliveryDate)
                      : order.fulfillment?.estimatedDeliveryDate
                        ? formatDate(order.fulfillment.estimatedDeliveryDate)
                      : '—'}
                </Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Label cost
                </Text>
                <Text>
                  {formatCurrency(order.labelCost, order.currency || 'USD')}
                </Text>
              </Stack>
            </Grid>
            {order.shippingLabelUrl && (
              <Button
                text="Print shipping label"
                tone="primary"
                mode="ghost"
                onClick={() => openUrl(order.shippingLabelUrl!)}
              />
            )}
          </Stack>
        </Card>

        <Card padding={4} radius={4} shadow={1} tone="default">
          <Stack space={3}>
            <Heading size={2}>Shipping address</Heading>
            <Box>
              <Text size={1} style={{whiteSpace: 'pre-line'}}>
                {buildAddress(order.shippingAddress)}
              </Text>
            </Box>
            {trackingNumber && (
              <Stack space={1}>
                <Text muted size={1}>
                  Tracking number
                </Text>
                <Button
                  text={trackingNumber}
                  mode="bleed"
                  tone="primary"
                  onClick={() => {
                    if (trackingUrl) {
                      openUrl(trackingUrl)
                    } else if (
                      typeof navigator !== 'undefined' &&
                      navigator.clipboard &&
                      typeof navigator.clipboard.writeText === 'function'
                    ) {
                      navigator.clipboard.writeText(trackingNumber || '')
                    }
                  }}
                />
                <Text muted size={1}>
                  {order.carrier || order.fulfillment?.carrier || 'Carrier'} •{' '}
                  {order.service || order.fulfillment?.service || 'Service'}
                </Text>
              </Stack>
            )}
          </Stack>
        </Card>
      </Grid>

      <Card padding={4} radius={4} shadow={1} tone="default">
        <Stack space={3}>
          <Heading size={2}>Shipping history</Heading>
          {shippingLog.length === 0 ? (
            <Text muted size={1}>
              No shipping events yet.
            </Text>
          ) : (
            <Stack space={3}>
              {shippingLog.map((entry) => {
                const meta = SHIPPING_META[(entry.status || '').toLowerCase()] || {
                  label: entry.status || 'Update',
                  tone: 'default' as const,
                }
                return (
                  <Card key={entry._key} padding={3} radius={3} tone="transparent" border>
                    <Flex align="center" justify="space-between">
                      <Stack space={2}>
                        <Badge tone={meta.tone} mode="outline" fontSize={0}>
                          {meta.label}
                        </Badge>
                        {entry.message && <Text>{entry.message}</Text>}
                        {entry.trackingNumber && (
                          <Text muted size={1}>
                            Tracking: {entry.trackingNumber}
                          </Text>
                        )}
                      </Stack>
                      <Text muted size={1}>
                        {formatDate(entry.createdAt) || '—'}
                      </Text>
                    </Flex>
                    {entry.trackingUrl && (
                      <Box marginTop={3}>
                        <Button
                          text="View tracking"
                          tone="primary"
                          mode="bleed"
                          onClick={() => openUrl(entry.trackingUrl!)}
                        />
                      </Box>
                    )}
                  </Card>
                )
              })}
            </Stack>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}
