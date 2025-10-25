import React, {useCallback, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  Stack,
  Text,
  Tooltip,
  Button,
} from '@sanity/ui'
import {DownloadIcon, EnvelopeIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'

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
  totalAmount?: number
  amountShipping?: number
  createdAt?: string
  packingSlipUrl?: string
  stripeSessionId?: string
  selectedService?: {
    carrier?: string
    service?: string
    amount?: number
    currency?: string
    deliveryDays?: number
    estimatedDeliveryDate?: string
  }
  shippingCarrier?: string
  shippingLabelUrl?: string
  trackingNumber?: string
  trackingUrl?: string
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

const getFnBase = (): string => {
  const envBase =
    typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('NLFY_BASE')
      if (stored) return stored
    } catch {
      // ignore
    }
    const origin = window.location?.origin
    if (origin && /^https?:/i.test(origin)) return origin
  }
  return 'https://fassanity.fasmotorsports.com'
}

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

  if (!order) {
    return (
      <Card padding={4}>
        <Text>No order data available.</Text>
      </Card>
    )
  }

  const base = getFnBase()
  const patchTargets = useMemo(() => resolvePatchTargets(order._id || ''), [order._id])

  const ensurePackingSlip = useCallback(async () => {
    if (downloadingSlip) return
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

      const asset = await client.assets.upload('file', blob, {
        filename: `packing-slip-${order.orderNumber || order._id}.pdf`,
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
  }, [base, client, downloadingSlip, order._id, order.orderNumber, order.packingSlipUrl, order.stripeSessionId, patchTargets])

  const handleEmailCustomer = useCallback(() => {
    if (!order.customerEmail) return
    const subject = encodeURIComponent(`Order ${order.orderNumber || order._id}`)
    const body = encodeURIComponent(
      [
        `Hi ${order.customerName || ''},`,
        '',
        'We wanted to follow up on your recent order. Let us know if you have any questions.',
        '',
        '— F.A.S. Motorsports',
      ].join('\n'),
    )
    window.location.href = `mailto:${order.customerEmail}?subject=${subject}&body=${body}`
  }, [order.customerEmail, order.customerName, order._id, order.orderNumber])

  const statusMeta = STATUS_META[order.status || ''] || {
    label: order.status || 'Unknown',
    tone: 'default' as const,
  }
  const paymentMeta = PAYMENT_META[(order.paymentStatus || '').toLowerCase()] || {
    label: order.paymentStatus || 'Unknown',
    tone: 'default' as const,
  }

  const shippingLog = Array.isArray(order.shippingLog) ? order.shippingLog : []

  return (
    <Stack space={4} padding={4}>
      <Card padding={4} radius={4} shadow={1}>
        <Flex align={['flex-start', 'center']} justify="space-between" wrap="wrap" gap={3}>
          <Stack space={2}>
            <Heading size={3}>
              Order {order.orderNumber || order._id.replace(/^drafts\./, '')}
            </Heading>
            <Flex gap={2} wrap="wrap">
              <Badge tone={statusMeta.tone} mode="outline" fontSize={0}>
                {statusMeta.label}
              </Badge>
              <Badge tone={paymentMeta.tone} mode="outline" fontSize={0}>
                {paymentMeta.label}
              </Badge>
              {order.trackingNumber && (
                <Badge tone="positive" mode="outline" fontSize={0}>
                  Tracking ready
                </Badge>
              )}
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
                <Text>{order.selectedService?.carrier || order.shippingCarrier || '—'}</Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Service
                </Text>
                <Text>{order.selectedService?.service || '—'}</Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Rate
                </Text>
                <Text>
                  {formatCurrency(
                    order.selectedService?.amount ?? order.amountShipping,
                    order.selectedService?.currency || 'USD',
                  )}
                </Text>
              </Stack>
              <Stack space={1}>
                <Text muted size={1}>
                  Delivery
                </Text>
                <Text>
                  {order.selectedService?.deliveryDays
                    ? `${order.selectedService.deliveryDays} days`
                    : '—'}
                </Text>
              </Stack>
            </Grid>
            {order.shippingLabelUrl && (
              <Button
                text="Open shipping label"
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
            {order.trackingNumber && (
              <Stack space={1}>
                <Text muted size={1}>
                  Tracking number
                </Text>
                <Button
                  text={order.trackingNumber}
                  mode="bleed"
                  tone="primary"
                  onClick={() => {
                    if (order.trackingUrl) {
                      openUrl(order.trackingUrl)
                    } else if (
                      typeof navigator !== 'undefined' &&
                      navigator.clipboard &&
                      typeof navigator.clipboard.writeText === 'function'
                    ) {
                      navigator.clipboard.writeText(order.trackingNumber || '')
                    }
                  }}
                />
              </Stack>
            )}
          </Stack>
        </Card>
      </Grid>

      <Card padding={4} radius={4} shadow={1} tone="default">
        <Stack space={3}>
          <Heading size={2}>Shipping history</Heading>
          {shippingLog.length === 0 ? (
            <Text muted size={1}>No shipping events yet.</Text>
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
                      <Text muted size={1}>{formatDate(entry.createdAt) || '—'}</Text>
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
