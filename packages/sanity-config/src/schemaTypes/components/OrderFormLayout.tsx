import React, {useMemo} from 'react'
import {Badge, Box, Button, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import type {DocumentLayoutProps} from 'sanity'
import {useFormValue} from 'sanity'
import {format} from 'date-fns'
import {UserIcon} from '@sanity/icons'

const formatStatus = (value?: string | null) =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Unknown'

const useOrderField = <T,>(path: string[]): T | undefined => useFormValue(path) as T | undefined

function OrderHeader() {
  const orderNumber = useOrderField<string>(['orderNumber'])
  const status = useOrderField<string>(['status'])
  const fulfillmentStatus = useOrderField<string>(['fulfillment', 'status'])
  const createdAt = useOrderField<string>(['createdAt'])

  const orderDate = createdAt ? format(new Date(createdAt), "MMMM d, yyyy 'at' h:mm a") : 'Unknown'

  const statusTone =
    status === 'fulfilled'
      ? 'positive'
      : status === 'paid'
        ? 'primary'
        : status === 'canceled' || status === 'cancelled'
          ? 'critical'
          : status === 'refunded'
            ? 'caution'
            : 'default'

  const fulfillmentTone =
    fulfillmentStatus === 'delivered'
      ? 'positive'
      : fulfillmentStatus === 'shipped'
        ? 'primary'
        : fulfillmentStatus === 'processing'
          ? 'caution'
          : 'default'

  return (
    <Card padding={4} radius={2} shadow={1} tone="default">
      <Stack space={3}>
        <Flex align="center" gap={3} wrap="wrap">
          <Heading size={2}>{orderNumber || 'New Order'}</Heading>
          <Badge tone={statusTone} padding={2} fontSize={2}>
            {formatStatus(status)}
          </Badge>
          <Badge tone={fulfillmentTone} padding={2} fontSize={2}>
            {formatStatus(fulfillmentStatus || 'unfulfilled')}
          </Badge>
        </Flex>
        <Text size={1} muted>
          {orderDate} • Online order
        </Text>
      </Stack>
    </Card>
  )
}

function LabelStatusBanner() {
  const labelPurchased = useOrderField<boolean>(['labelPurchased'])
  const trackingNumber = useOrderField<string>(['trackingNumber'])
  const labelPurchasedAt = useOrderField<string>(['labelPurchasedAt'])
  const labelPurchasedBy = useOrderField<string>(['labelPurchasedBy'])

  if (!labelPurchased) {
    return (
      <Card padding={3} radius={2} shadow={1} tone="caution">
        <Flex align="center" gap={3}>
          <Text size={1} weight="semibold">
            Warning: Shipping label not purchased
          </Text>
          <Text size={1} muted>
            Use &ldquo;Create Shipping Label&rdquo; to buy a label after reviewing the order.
          </Text>
        </Flex>
      </Card>
    )
  }

  const formattedDate = labelPurchasedAt ? format(new Date(labelPurchasedAt), 'MMM d, yyyy') : null
  return (
    <Card padding={3} radius={2} shadow={1} tone="positive">
      <Stack space={2}>
        <Text size={1} weight="semibold">
          Shipping label purchased
        </Text>
        <Text size={1} muted>
          {trackingNumber ? `Tracking ${trackingNumber}` : 'Tracking pending'}
          {formattedDate ? ` • Purchased ${formattedDate}` : ''}
          {labelPurchasedBy ? ` • By ${labelPurchasedBy}` : ''}
        </Text>
      </Stack>
    </Card>
  )
}

function CustomerCard() {
  const customerName = useOrderField<string>(['customerName'])
  const customerEmail = useOrderField<string>(['customerEmail'])
  const customerRef = useOrderField<{_ref?: string}>(['customerRef'])
  const customerId = customerRef?._ref

  const handleView = () => {
    if (!customerId) return
    window.open(`/desk/customer;${customerId}`, '_blank', 'noopener')
  }

  return (
    <Card padding={[3, 3, 4]} radius={2} shadow={1}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Box>
          <Text size={[2, 2, 3]} weight="semibold">
            {customerName || 'Unknown customer'}
          </Text>
          <Text size={1} muted>
            {customerEmail || 'No email available'}
          </Text>
        </Box>
        {customerId && (
          <Button
            icon={UserIcon}
            mode="ghost"
            text="View profile"
            fontSize={1}
            onClick={handleView}
          />
        )}
      </Flex>
    </Card>
  )
}

const formatAddress = (address?: Record<string, string | undefined> | null): string => {
  if (!address) return 'No address provided'
  const lines = [
    address.name,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
    address.phone,
    address.email,
  ].filter(Boolean)
  return lines.join('\n')
}

function AddressCards() {
  const shippingAddress = useOrderField<Record<string, string | undefined>>(['shippingAddress'])
  const billingAddress = useOrderField<Record<string, string | undefined>>(['billingAddress'])

  const shippingValue = useMemo(() => formatAddress(shippingAddress), [shippingAddress])
  const billingValue = useMemo(() => formatAddress(billingAddress), [billingAddress])

  return (
    <Grid columns={[1, 1, 2]} gap={3}>
      <Card padding={3} radius={2} shadow={1} border tone="transparent">
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Shipping address
          </Text>
          <textarea
            readOnly
            value={shippingValue}
            style={{
              width: '100%',
              minHeight: 140,
              padding: 8,
              fontFamily: 'monospace',
              fontSize: 13,
              border: '1px solid var(--card-border-color)',
              borderRadius: 4,
              backgroundColor: 'var(--card-bg-color)',
              color: 'var(--card-fg-color)',
              resize: 'none',
            }}
          />
        </Stack>
      </Card>
      <Card padding={3} radius={2} shadow={1} border tone="transparent">
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Billing address
          </Text>
          <textarea
            readOnly
            value={billingValue}
            style={{
              width: '100%',
              minHeight: 140,
              padding: 8,
              fontFamily: 'monospace',
              fontSize: 13,
              border: '1px solid var(--card-border-color)',
              borderRadius: 4,
              backgroundColor: 'var(--card-bg-color)',
              color: 'var(--card-fg-color)',
              resize: 'none',
            }}
          />
        </Stack>
      </Card>
    </Grid>
  )
}

function OrderSummary() {
  const amountSubtotal = useOrderField<number>(['amountSubtotal']) || 0
  const amountTax = useOrderField<number>(['amountTax']) || 0
  const amountShipping = useOrderField<number>(['amountShipping']) || 0
  const amountDiscount = useOrderField<number>(['amountDiscount']) || 0
  const totalAmount = useOrderField<number>(['totalAmount']) || 0
  const currency = (useOrderField<string>(['currency']) || 'USD').toUpperCase()

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {style: 'currency', currency}).format(value || 0)

  return (
    <Card padding={4} radius={2} shadow={1} border tone="transparent">
      <Stack space={3}>
        <Flex justify="space-between">
          <Text size={1}>Subtotal</Text>
          <Text size={1} weight="medium">
            {formatCurrency(amountSubtotal)}
          </Text>
        </Flex>
        {amountDiscount > 0 && (
          <Flex justify="space-between">
            <Text size={1}>Discount</Text>
            <Text size={1} weight="medium" style={{color: 'var(--card-badge-caution-fg-color)'}}>
              -{formatCurrency(amountDiscount)}
            </Text>
          </Flex>
        )}
        <Flex justify="space-between">
          <Text size={1}>Shipping</Text>
          <Text size={1} weight="medium">
            {formatCurrency(amountShipping)}
          </Text>
        </Flex>
        <Flex justify="space-between">
          <Text size={1}>Tax</Text>
          <Text size={1} weight="medium">
            {formatCurrency(amountTax)}
          </Text>
        </Flex>
        <Box paddingTop={2} style={{borderTop: '1px solid var(--card-border-color)'}}>
          <Flex justify="space-between">
            <Text size={2} weight="bold">
              Total
            </Text>
            <Text size={2} weight="bold">
              {formatCurrency(totalAmount)}
            </Text>
          </Flex>
        </Box>
      </Stack>
    </Card>
  )
}

export function OrderFormLayout(props: DocumentLayoutProps) {
  return (
    <Stack space={4}>
      <Box padding={4}>
        <Stack space={4}>
          <OrderHeader />
          <LabelStatusBanner />
          <CustomerCard />
          <AddressCards />
        </Stack>
      </Box>
      {props.renderDefault(props)}
      <Box padding={4}>
        <OrderSummary />
      </Box>
    </Stack>
  )
}
