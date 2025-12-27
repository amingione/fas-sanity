import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {ArrowRightIcon} from '@sanity/icons'
import {Button, Flex, Inline, Stack, Text, useToast} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {DocumentBadge, buildOrderStatusBadges} from './documentTables/DocumentBadge'
import {formatOrderNumber} from '../../utils/orderNumber'

type CustomerOrderSummaryValue = {
  orderDocumentId?: string | null
  orderNumber?: string
  status?: string | null
  paymentStatus?: string | null
  stripePaymentIntentStatus?: string | null
  createdAt?: string | null
  total?: number | null
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
})

const formatTotal = (amount?: number | null) => {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return ''
  return currencyFormatter.format(amount)
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return dateFormatter.format(date)
}

const ORDER_LOOKUP_QUERY = `*[_type == "order" && (
  (_id == $targetId && $targetId != null) ||
  (_id == $draftId && $draftId != null) ||
  (lower(string(orderNumber)) == $orderNumberLower && $orderNumberLower != null) ||
  (replace(lower(string(orderNumber)), "[^0-9]", "") == $orderNumberDigits && $orderNumberDigits != null)
)] | order(_updatedAt desc)[0]{
  _id,
  orderNumber,
  status,
  paymentStatus,
  stripePaymentIntentStatus,
  "createdAt": coalesce(createdAt, _createdAt),
  "total": coalesce(totalAmount, amountSubtotal - coalesce(amountDiscount, 0) + amountTax + amountShipping, totalAmount, total)
}`

const normalizeDocumentId = (value?: string | null) =>
  typeof value === 'string' && value ? value.replace(/^drafts\./, '') : null

export function CustomerOrderSummaryPreview({
  value,
}: {
  value?: CustomerOrderSummaryValue
}): React.ReactElement {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const {push: pushToast} = useToast()
  const [resolvedOrderId, setResolvedOrderId] = useState<string | null>(
    () => normalizeDocumentId(value?.orderDocumentId) || null,
  )
  const [orderDetails, setOrderDetails] = useState<{
    orderNumber?: string | null
    status?: string | null
    paymentStatus?: string | null
    stripePaymentIntentStatus?: string | null
    createdAt?: string | null
    total?: number | null
  }>(() => ({
    orderNumber: value?.orderNumber || null,
    status: value?.status || null,
    paymentStatus: value?.paymentStatus || null,
    stripePaymentIntentStatus: value?.stripePaymentIntentStatus || null,
    createdAt: value?.createdAt || null,
    total: typeof value?.total === 'number' ? value.total : null,
  }))
  const [isResolvingOrder, setResolvingOrder] = useState(false)
  const [isHydratingOrder, setHydratingOrder] = useState(false)

  useEffect(() => {
    const normalizedId = normalizeDocumentId(value?.orderDocumentId)
    setResolvedOrderId((prev) => normalizedId || prev)
  }, [value?.orderDocumentId])

  useEffect(() => {
    setOrderDetails((prev) => ({
      orderNumber: value?.orderNumber ?? prev.orderNumber,
      status: value?.status ?? prev.status,
      paymentStatus: value?.paymentStatus ?? prev.paymentStatus,
      stripePaymentIntentStatus: value?.stripePaymentIntentStatus ?? prev.stripePaymentIntentStatus,
      createdAt: value?.createdAt ?? prev.createdAt,
      total:
        typeof value?.total === 'number' && !Number.isNaN(value.total) ? value.total : prev.total,
    }))
  }, [
    value?.orderNumber,
    value?.status,
    value?.paymentStatus,
    value?.stripePaymentIntentStatus,
    value?.createdAt,
    value?.total,
  ])

  const rawOrderNumber = orderDetails.orderNumber ? String(orderDetails.orderNumber).trim() : ''
  const sanitizedOrderNumber = rawOrderNumber.replace(/^#/, '')
  const formattedOrderNumber = formatOrderNumber(sanitizedOrderNumber)
  const orderNumberLabel = formattedOrderNumber || sanitizedOrderNumber || 'Order'
  const orderNumberForLookup = formattedOrderNumber || sanitizedOrderNumber
  const orderNumberLower = orderNumberForLookup ? orderNumberForLookup.toLowerCase() : null
  const orderNumberDigits = orderNumberForLookup
    ? orderNumberForLookup.replace(/[^0-9]/g, '') || null
    : null

  const statusBadges = useMemo(
    () =>
      buildOrderStatusBadges({
        paymentStatus: orderDetails.paymentStatus,
        orderStatus: orderDetails.status,
      }),
    [orderDetails.paymentStatus, orderDetails.status],
  )

  const metadata = useMemo(
    () =>
      [formatDate(orderDetails.createdAt), formatTotal(orderDetails.total)]
        .filter(Boolean)
        .join(' • '),
    [orderDetails.createdAt, orderDetails.total],
  )

  const hydrateOrderSummary = useCallback(async () => {
    if (isHydratingOrder) return
    if (!resolvedOrderId && !orderNumberForLookup) return
    try {
      setHydratingOrder(true)
      const order = await client.fetch<{
        _id?: string
        orderNumber?: string
        status?: string
        paymentStatus?: string
        stripePaymentIntentStatus?: string
        createdAt?: string
        total?: number
      } | null>(ORDER_LOOKUP_QUERY, {
        targetId: resolvedOrderId || null,
        draftId: resolvedOrderId ? `drafts.${resolvedOrderId}` : null,
        orderNumberLower,
        orderNumberDigits,
      })

      if (order) {
        const normalizedId = normalizeDocumentId(order._id)
        setResolvedOrderId((prev) => normalizedId || prev)
        setOrderDetails((prev) => ({
          orderNumber: order.orderNumber || prev.orderNumber,
          status: order.status || prev.status,
          paymentStatus: order.paymentStatus || prev.paymentStatus,
          stripePaymentIntentStatus:
            order.stripePaymentIntentStatus || prev.stripePaymentIntentStatus,
          createdAt: order.createdAt || prev.createdAt,
          total:
            typeof order.total === 'number' && !Number.isNaN(order.total)
              ? Number(order.total)
              : prev.total,
        }))
      }
    } catch (err) {
      console.error('Failed to hydrate customer order summary preview', err)
    } finally {
      setHydratingOrder(false)
    }
  }, [
    client,
    isHydratingOrder,
    orderNumberDigits,
    orderNumberForLookup,
    orderNumberLower,
    resolvedOrderId,
  ])

  useEffect(() => {
    const missingStatus =
      !orderDetails.status &&
      !orderDetails.paymentStatus &&
      !orderDetails.stripePaymentIntentStatus
    const missingOrderNumber = !orderNumberForLookup && Boolean(resolvedOrderId)
    if (
      (missingStatus || missingOrderNumber) &&
      (resolvedOrderId || orderNumberForLookup) &&
      !isHydratingOrder
    ) {
      hydrateOrderSummary()
    }
  }, [
    hydrateOrderSummary,
    isHydratingOrder,
    orderDetails.paymentStatus,
    orderDetails.status,
    orderDetails.stripePaymentIntentStatus,
    orderNumberForLookup,
    resolvedOrderId,
  ])

  const handleOpenOrder = useCallback(async () => {
    const targetOrderNumber = orderNumberForLookup
    if (resolvedOrderId) {
      router.navigateIntent('edit', {id: resolvedOrderId, type: 'order'})
      return
    }

    if (!targetOrderNumber || isResolvingOrder) {
      if (!targetOrderNumber) {
        pushToast({
          status: 'warning',
          title: 'Order number unavailable',
          description: 'This summary is missing its order number, so it cannot be opened.',
        })
      }
      return
    }

    try {
      setResolvingOrder(true)
      const order =
        (await client.fetch<{
          _id?: string
          orderNumber?: string
          status?: string
          paymentStatus?: string
          stripePaymentIntentStatus?: string
          createdAt?: string
          total?: number
        } | null>(ORDER_LOOKUP_QUERY, {
          targetId: null,
          draftId: null,
          orderNumberLower,
          orderNumberDigits,
        })) || null

      if (order?._id) {
        const normalizedId = normalizeDocumentId(order._id) || order._id
        setResolvedOrderId(normalizedId)
        setOrderDetails((prev) => ({
          orderNumber: order.orderNumber || prev.orderNumber,
          status: order.status || prev.status,
          paymentStatus: order.paymentStatus || prev.paymentStatus,
          stripePaymentIntentStatus:
            order.stripePaymentIntentStatus || prev.stripePaymentIntentStatus,
          createdAt: order.createdAt || prev.createdAt,
          total:
            typeof order.total === 'number' && !Number.isNaN(order.total)
              ? Number(order.total)
              : prev.total,
        }))
        router.navigateIntent('edit', {id: normalizedId, type: 'order'})
      } else {
        pushToast({
          status: 'warning',
          title: 'Order not found',
          description: `No order document matched ${targetOrderNumber}.`,
        })
      }
    } catch (err) {
      console.error('Failed to resolve order from customer activity preview', err)
      pushToast({
        status: 'error',
        title: 'Unable to open order',
        description: 'Try again in a moment or open the Orders list instead.',
      })
    } finally {
      setResolvingOrder(false)
    }
  }, [
    client,
    isResolvingOrder,
    orderNumberDigits,
    orderNumberForLookup,
    orderNumberLower,
    pushToast,
    resolvedOrderId,
    router,
  ])

  return (
    <Stack space={2} paddingY={2}>
      <Flex align="center" justify="space-between" gap={3}>
        <Text weight="semibold">{orderNumberLabel}</Text>
        <Button
          icon={ArrowRightIcon}
          mode="bleed"
          onClick={handleOpenOrder}
          text="Open Order"
          tone="primary"
          loading={isResolvingOrder}
          disabled={(!resolvedOrderId && !orderNumberForLookup) || isResolvingOrder}
        />
      </Flex>
      {statusBadges.length ? (
        <Inline space={3} style={{flexWrap: 'wrap', rowGap: '8px'}}>
          {statusBadges.map((badge) => (
            <DocumentBadge
              key={badge.key}
              label={badge.label}
              tone={badge.tone}
              title={badge.title}
            />
          ))}
        </Inline>
      ) : null}
      {metadata ? (
        <Text size={1} muted>
          {metadata}
        </Text>
      ) : null}
    </Stack>
  )
}
