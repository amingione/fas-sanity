import React, {useMemo, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Heading, Stack, Text, useToast} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

type DocumentViewProps = {
  document?: {
    displayed?: OrderDocument | null
    draft?: OrderDocument | null
    published?: OrderDocument | null
  }
  schemaType?: unknown
}

type SanityReference = {
  _type: 'reference'
  _ref: string
}

type OrderAddress = {
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

type OrderCartItem = {
  _key?: string
  name?: string
  sku?: string
  quantity?: number
  price?: number
  lineTotal?: number
  optionSummary?: string
  optionDetails?: string[] | string | null
  upgrades?: string[] | string | null
}

type OrderDocument = {
  _id: string
  orderNumber?: string
  status?: string
  paymentStatus?: string
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  amountShipping?: number
  shippingCarrier?: string
  trackingNumber?: string
  shippingLabelUrl?: string
  shipStationOrderId?: string
  fulfilledAt?: string
  createdAt?: string
  customerEmail?: string
  customerName?: string
  shippingAddress?: OrderAddress
  cart?: OrderCartItem[]
  invoiceRef?: SanityReference | {_ref?: string}
}

type InvoiceDocument = {
  _id: string
  invoiceNumber?: string
  status?: string
}

const badgeTone = (status?: string) => {
  if (!status) return 'default'
  switch (status.toLowerCase()) {
    case 'paid':
    case 'fulfilled':
      return 'positive'
    case 'processing':
    case 'pending':
      return 'caution'
    case 'cancelled':
    case 'failed':
      return 'critical'
    default:
      return 'default'
  }
}

const money = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

const toStringArray = (input: unknown): string[] => {
  if (!input) return []
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item : typeof item === 'number' ? String(item) : ''))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return []
    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return toStringArray(parsed)
      } catch {
        // ignore parse errors
      }
    }
    return trimmed
      .split(/[,;|]/g)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

const preferValue = <T,>(...values: Array<T | null | undefined>): T | undefined => {
  for (const value of values) {
    if (value !== null && value !== undefined) return value
  }
  return undefined
}

const normalizeAddress = (source?: OrderAddress | null): string[] | null => {
  if (!source) {
    return null
  }
  const {name, phone, email, addressLine1, addressLine2, city, state, postalCode, country} = source
  const rawLines = [
    name || '',
    [addressLine1, addressLine2].filter(Boolean).join(', '),
    [city, state, postalCode].filter(Boolean).join(', '),
    country || '',
    [email || '', phone || ''].filter(Boolean).join(' • '),
  ]

  const cleanLines = rawLines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => !!line)

  return cleanLines.length ? cleanLines : null
}

const dateLabel = (value?: string) => {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function OrderDetailView(props: DocumentViewProps) {
  const toast = useToast()
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const [creatingInvoice, setCreatingInvoice] = useState(false)

  const order = useMemo<OrderDocument | null>(() => {
    return (
      (props.document?.displayed as OrderDocument | undefined) ||
      (props.document?.draft as OrderDocument | undefined) ||
      (props.document?.published as OrderDocument | undefined) ||
      null
    )
  }, [props.document])

  const invoiceRefId = order?.invoiceRef && typeof order.invoiceRef === 'object' ? order.invoiceRef._ref : undefined

  const headerTitle = order?.orderNumber
    ? `Order ${order.orderNumber}`
    : order?._id
    ? `Order ${order._id.slice(-6)}`
    : 'Order'

  const statusBadges = useMemo(() => {
    if (!order) return []
    return [
      order.status ? {label: order.status, tone: badgeTone(order.status)} : null,
      order.paymentStatus ? {label: `Payment: ${order.paymentStatus}`, tone: badgeTone(order.paymentStatus)} : null,
      order.fulfilledAt ? {label: 'Fulfilled', tone: 'positive'} : null,
    ].filter(Boolean) as {label: string; tone: 'default' | 'positive' | 'critical' | 'caution'}[]
  }, [order])

  const lineItems = useMemo(() => {
    if (!order?.cart || !Array.isArray(order.cart) || order.cart.length === 0) return []
    return order.cart.map((item) => {
      const quantity = preferValue(Number(item.quantity), 1) || 1
      const unitPrice = preferValue(
        typeof item.price === 'number' ? item.price : undefined,
        typeof item.lineTotal === 'number' && quantity ? item.lineTotal / quantity : undefined
      )
      const explicitTotal = typeof item.lineTotal === 'number' ? item.lineTotal : undefined
      const total = explicitTotal ?? (typeof unitPrice === 'number' ? unitPrice * quantity : undefined)
      const detailParts: string[] = []
      if (item.optionSummary) detailParts.push(item.optionSummary.trim())
      const optionDetails = toStringArray(item.optionDetails)
      if (optionDetails.length) detailParts.push(optionDetails.join(' • '))
      const upgrades = toStringArray(item.upgrades)
      if (upgrades.length) detailParts.push(`Upgrades: ${upgrades.join(', ')}`)
      if (item.sku) detailParts.push(`SKU ${item.sku}`)
      return {
        _key: item._key || item.sku || item.name || Math.random().toString(36).slice(2),
        name: item.name || item.sku || 'Item',
        quantity,
        unitPrice,
        total,
        details: detailParts.filter(Boolean),
      }
    })
  }, [order?.cart])

  const totals = useMemo(() => {
    const subtotal =
      order?.amountSubtotal ??
      lineItems.reduce((sum, item) => {
        return sum + (typeof item.total === 'number' ? item.total : 0)
      }, 0)
    const shipping = order?.amountShipping ?? 0
    const tax = order?.amountTax ?? 0
    const grandTotal = order?.totalAmount ?? subtotal + shipping + tax
    return {subtotal, shipping, tax, total: grandTotal}
  }, [lineItems, order?.amountShipping, order?.amountSubtotal, order?.amountTax, order?.totalAmount])

  const handleOpenInvoice = (invoiceId: string) => {
    router.navigateIntent('edit', {id: invoiceId, type: 'invoice'})
  }

type InvoiceCreatePayload = {
  _type: 'invoice'
  status: 'pending' | 'paid' | 'refunded' | 'cancelled'
  orderNumber?: string
  orderRef: SanityReference
  billTo?: Record<string, any>
  shipTo?: Record<string, any>
  customerEmail?: string
  lineItems: Array<Record<string, any>>
  taxRate: number
  discountType: 'amount' | 'percent'
  discountValue: number
}

  const createInvoiceFromOrder = async () => {
    if (!order) return
    if (creatingInvoice) return
    if (invoiceRefId) {
      handleOpenInvoice(invoiceRefId)
      return
    }
    setCreatingInvoice(true)
    try {
      const lineItemsForInvoice = (order.cart || []).map((item) => ({
        _type: 'invoiceLineItem',
        kind: 'custom',
        description: item.name || item.sku || 'Item',
        sku: item.sku,
        quantity: preferValue(Number(item.quantity), 1) || 1,
        unitPrice: typeof item.price === 'number' ? item.price : undefined,
        lineTotal: typeof item.lineTotal === 'number' ? item.lineTotal : undefined,
        optionSummary: item.optionSummary,
        optionDetails: Array.isArray(item.optionDetails) ? item.optionDetails : undefined,
        upgrades: Array.isArray(item.upgrades) ? item.upgrades : undefined,
      }))

      const sanitizeAddress = (addr?: OrderAddress | null) => {
        if (!addr) return undefined
        return {
          name: addr.name || '',
          phone: addr.phone || '',
          email: addr.email || order?.customerEmail || '',
          address_line1: addr.addressLine1 || '',
          address_line2: addr.addressLine2 || '',
          city_locality: addr.city || '',
          state_province: addr.state || '',
          postal_code: addr.postalCode || '',
          country_code: addr.country || '',
        }
      }

      const payload: InvoiceCreatePayload = {
        _type: 'invoice',
        status: 'pending',
        orderNumber: order.orderNumber || '',
        orderRef: {_type: 'reference', _ref: order._id},
        billTo: sanitizeAddress(order.shippingAddress),
        shipTo: sanitizeAddress(order.shippingAddress),
        customerEmail: order.customerEmail || '',
        lineItems: lineItemsForInvoice,
        taxRate: 0,
        discountType: 'amount',
        discountValue: 0,
      }

      const created = await client.create(payload, {autoGenerateArrayKeys: true})

      await client
        .patch(order._id)
        .set({invoiceRef: {_type: 'reference', _ref: created._id}})
        .commit({autoGenerateArrayKeys: true})

      toast.push({
        status: 'success',
        title: 'Invoice created',
        description: 'Opened invoice based on this order.',
      })

      router.navigateIntent('edit', {id: created._id, type: 'invoice'})
    } catch (err: any) {
      console.error('OrderDetailView: invoice creation failed', err)
      toast.push({
        status: 'error',
        title: 'Could not create invoice',
        description: err?.message || 'Check console for details',
      })
    } finally {
      setCreatingInvoice(false)
    }
  }

  const [invoiceDoc, setInvoiceDoc] = useState<InvoiceDocument | null>(null)

  React.useEffect(() => {
    let cancelled = false
    if (!invoiceRefId) {
      setInvoiceDoc(null)
      return () => {
        cancelled = true
      }
    }
    client
      .fetch<InvoiceDocument>(
        `*[_type == "invoice" && _id == $id][0]{_id, invoiceNumber, status}`,
        {id: invoiceRefId}
      )
      .then((doc) => {
        if (!cancelled) setInvoiceDoc(doc || null)
      })
      .catch(() => {
        if (!cancelled) setInvoiceDoc(null)
      })
    return () => {
      cancelled = true
    }
  }, [client, invoiceRefId])

  if (!order) {
    return (
      <Card padding={4}>
        <Text size={2}>Order data not available.</Text>
      </Card>
    )
  }

  return (
    <Box padding={4} style={{backgroundColor: '#f8fafc', height: '100%', overflow: 'auto'}}>
      <Stack space={4}>
        <Card padding={4} radius={3} shadow={1} tone="transparent" style={{backgroundColor: '#ffffff'}}>
          <Flex align="flex-start" justify="space-between" wrap="wrap" gap={4}>
            <Stack space={3}>
              <Heading size={3}>{headerTitle}</Heading>
              <Flex gap={2} wrap="wrap">
                {statusBadges.map((badge) => (
                  <Badge key={badge.label} tone={badge.tone} padding={2} mode="outline">
                    {badge.label}
                  </Badge>
                ))}
              </Flex>
              <Stack space={1}>
                <Text size={1} muted>
                  Placed {dateLabel(order.createdAt)}
                </Text>
                {order.fulfilledAt && (
                  <Text size={1} muted>
                    Fulfilled {dateLabel(order.fulfilledAt)}
                  </Text>
                )}
              </Stack>
            </Stack>
            <Stack space={3} style={{minWidth: '220px'}}>
              {invoiceDoc ? (
                <Button
                  mode="default"
                  tone="primary"
                  text={`Open invoice ${invoiceDoc.invoiceNumber || ''}`.trim()}
                  onClick={() => handleOpenInvoice(invoiceDoc._id)}
                />
              ) : (
                <Button
                  tone="primary"
                  text="Create invoice"
                  loading={creatingInvoice}
                  disabled={creatingInvoice}
                  onClick={createInvoiceFromOrder}
                />
              )}
              <Box paddingX={1}>
                <Text size={1} muted>
                  Need to edit customer-facing totals? Use an invoice – this keeps orders focused on
                  fulfillment.
                </Text>
              </Box>
            </Stack>
          </Flex>
        </Card>

        <Flex direction={['column', 'row']} gap={4}>
          <Card flex={2} padding={4} radius={3} shadow={1} style={{backgroundColor: '#ffffff'}}>
            <Stack space={4}>
              <Heading size={2}>Items</Heading>
              {lineItems.length === 0 ? (
                <Text size={1} muted>
                  No cart items recorded for this order.
                </Text>
              ) : (
                <Stack space={3}>
                  {lineItems.map((item) => (
                    <Card
                      key={item._key}
                      padding={3}
                      radius={2}
                      tone="transparent"
                      style={{backgroundColor: '#f1f5f9'}}
                    >
                      <Flex justify="space-between" align="flex-start" gap={4}>
                        <Stack space={2} style={{flex: 1}}>
                          <Text weight="semibold">{item.name}</Text>
                          {item.details.length > 0 && (
                            <Text size={1} muted>
                              {item.details.join(' • ')}
                            </Text>
                          )}
                        </Stack>
                        <Stack space={1} style={{minWidth: '160px', textAlign: 'right'}}>
                          <Text size={1} muted>
                            Qty {item.quantity}
                          </Text>
                          {typeof item.unitPrice === 'number' && (
                            <Text size={1} muted>
                              Unit {money(item.unitPrice)}
                            </Text>
                          )}
                          {typeof item.total === 'number' && (
                            <Text weight="semibold">{money(item.total)}</Text>
                          )}
                        </Stack>
                      </Flex>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <Stack flex={1} space={4} style={{minWidth: '260px'}}>
            <Card padding={4} radius={3} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={3}>
                <Heading size={2}>Totals</Heading>
                <Flex justify="space-between">
                  <Text muted>Subtotal</Text>
                  <Text>{money(totals.subtotal)}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text muted>Shipping</Text>
                  <Text>{money(totals.shipping)}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text muted>Tax</Text>
                  <Text>{money(totals.tax)}</Text>
                </Flex>
                <Box paddingTop={3} style={{borderTop: '1px solid #e2e8f0'}}>
                  <Flex justify="space-between">
                    <Text weight="semibold">Total</Text>
                    <Text weight="bold">{money(totals.total)}</Text>
                  </Flex>
                </Box>
              </Stack>
            </Card>

            <Card padding={4} radius={3} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={3}>
                <Heading size={2}>Customer</Heading>
                {order.customerName && <Text weight="semibold">{order.customerName}</Text>}
                {order.customerEmail && (
                  <Text size={1} muted>
                    {order.customerEmail}
                  </Text>
                )}
                {normalizeAddress(order.shippingAddress)?.map((line: string) => (
                  <Text key={line} size={1} muted>
                    {line}
                  </Text>
                ))}
              </Stack>
            </Card>

            <Card padding={4} radius={3} shadow={1} style={{backgroundColor: '#ffffff'}}>
              <Stack space={3}>
                <Heading size={2}>Shipping</Heading>
                <Text size={1} muted>
                  Carrier: {order.shippingCarrier || 'Not set'}
                </Text>
                {order.trackingNumber ? (
                  <Text size={1} muted>Tracking: {order.trackingNumber}</Text>
                ) : (
                  <Text size={1} muted>Tracking: Not assigned</Text>
                )}
                {order.shippingLabelUrl && (
                  <Box>
                    <a
                      href={order.shippingLabelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{fontSize: '0.875rem', color: '#0ea5e9'}}
                    >
                      View shipping label
                    </a>
                  </Box>
                )}
              </Stack>
            </Card>
          </Stack>
        </Flex>
      </Stack>
    </Box>
  )
}

export default OrderDetailView
