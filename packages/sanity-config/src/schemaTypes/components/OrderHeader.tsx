// schemas/components/OrderHeader.tsx
import React from 'react'
import {Container, Card, Text, Box, Stack, TextArea, Badge, Flex} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {set, unset} from 'sanity'
import {format} from 'date-fns'
import {ShippingDetails} from './ShippingDetails'

export function OrderHeader(props: any) {
  const {onChange} = props

  // Get order data from form
  const orderNumber = useFormValue(['orderNumber']) as string
  const createdAt = useFormValue(['createdAt']) as string
  const status = useFormValue(['status']) as string
  const paymentStatus = useFormValue(['paymentStatus']) as string

  // Try new structure first, fallback to old structure
  const fulfillmentDetails = useFormValue(['fulfillmentDetails']) as any
  const oldFulfillment = useFormValue(['fulfillment']) as any

  const totalAmount = useFormValue(['totalAmount']) as number
  const cart = useFormValue(['cart']) as any[]
  const fulfillmentNotes =
    fulfillmentDetails?.fulfillmentNotes || oldFulfillment?.fulfillmentNotes || ''

  // Format date
  const formattedDate = createdAt ? format(new Date(createdAt), 'MMMM d, yyyy') : 'Unknown date'

  // Status badge colors
  const getStatusTone = (status: string) => {
    const tones: Record<string, any> = {
      paid: 'primary',
      fulfilled: 'positive',
      delivered: 'positive',
      canceled: 'critical',
      cancelled: 'critical',
      refunded: 'caution',
      unfulfilled: 'caution',
      processing: 'primary',
      shipped: 'positive',
    }
    return tones[status] || 'default'
  }

  // Format status for display
  const formatStatus = (status: string) => {
    if (!status) return 'Unknown'
    if (status === 'cancelled') return 'Cancelled'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  return (
    <Stack space={4}>
      <Container width={1}>
        <Card padding={4} border radius={2} shadow={1}>
          <Stack space={4}>
            <Flex align="center" gap={3} wrap="wrap">
              <Text size={[2, 2, 3, 4]} weight="bold">
                Order #{orderNumber || 'New Order'}
              </Text>
            </Flex>

            {/* Status Line: Date | Payment Status | Order Status */}
            <Flex align="center" gap={3} wrap="wrap">
              <Text size={[1, 1, 2, 3]} muted>
                {formattedDate}
              </Text>
              {paymentStatus && (
                <>
                  <Text size={[1, 1, 2, 3]} muted>
                    |
                  </Text>
                  <Badge tone={getStatusTone(paymentStatus)} fontSize={[1, 1, 2]}>
                    {formatStatus(paymentStatus)}
                  </Badge>
                </>
              )}
              {status && (
                <>
                  <Text size={[1, 1, 2, 3]} muted>
                    |
                  </Text>
                  <Badge tone={getStatusTone(status)} fontSize={[1, 1, 2]}>
                    {formatStatus(status)}
                  </Badge>
                </>
              )}
            </Flex>

            {/* Order Items */}
            {cart && cart.length > 0 && (
              <Stack space={3}>
                {cart.map((item: any, index: number) => {
                  const displayName = item.name || 'Unknown Product'
                  const optionsText = item.optionSummary || item.optionDetails?.join(' • ')
                  const addOnsText = item.upgrades?.join(', ') || item.addOns?.join(', ')

                  return (
                    <Box
                      key={item._key || index}
                      paddingY={2}
                      style={{borderBottom: '1px solid var(--card-border-color)'}}
                    >
                      <Stack space={2}>
                        <Text size={3} weight="semibold">
                          {displayName}
                        </Text>

                        {item.sku && (
                          <Text size={1} muted>
                            SKU: {item.sku}
                          </Text>
                        )}

                        {optionsText && (
                          <Text size={1} muted>
                            Options: {optionsText}
                          </Text>
                        )}

                        {addOnsText && (
                          <Text size={1} muted>
                            Upgrades: {addOnsText}
                          </Text>
                        )}

                        <Text size={2} weight="medium">
                          Qty: {item.quantity || 1} × ${item.price?.toFixed(2) || '0.00'} = $
                          {item.total?.toFixed(2) ||
                            ((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                        </Text>
                      </Stack>
                    </Box>
                  )
                })}
              </Stack>
            )}

            <Text size={[2, 2, 3]} weight="bold">
              Total: ${totalAmount?.toFixed(2) || '0.00'}
            </Text>
          </Stack>
        </Card>
      </Container>

      {/* SHIPPING DETAILS COMPONENT */}
      <Container width={1}>
        <ShippingDetails />
      </Container>

      <Container width={1}>
        <Card padding={4} border radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={[2, 2, 3, 4]} weight="bold">
              Internal Notes
            </Text>
            <TextArea
              fontSize={[2, 2, 3, 4]}
              onChange={(event) => {
                const newValue = event.currentTarget.value
                // Update the fulfillmentDetails.fulfillmentNotes field
                onChange(
                  newValue
                    ? set(newValue, ['fulfillmentDetails', 'fulfillmentNotes'])
                    : unset(['fulfillmentDetails', 'fulfillmentNotes']),
                )
              }}
              padding={[3, 3, 4]}
              placeholder="Add internal notes about this order..."
              value={fulfillmentNotes}
              rows={4}
            />
          </Stack>
        </Card>
      </Container>
    </Stack>
  )
}
