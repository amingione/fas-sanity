// schemas/components/OrderHeader.tsx
import React, {useCallback, useEffect, useRef, useState} from 'react'
import {Container, Card, Text, Box, Stack, TextArea, Flex, Inline} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {set, unset} from 'sanity'
import {format} from 'date-fns'
import {ShippingDetails} from './ShippingDetails'
import {DocumentBadge, buildOrderStatusBadges} from '../../components/studio/documentTables/DocumentBadge'

export function OrderHeader(props: any) {
  const {onChange} = props

  // Get order data from form
  const orderNumber = useFormValue(['orderNumber']) as string
  const createdAt = useFormValue(['createdAt']) as string
  const status = useFormValue(['status']) as string
  const paymentStatus = useFormValue(['paymentStatus']) as string
  const stripePaymentIntentStatus = useFormValue(['stripePaymentIntentStatus']) as string

  // Try new structure first, fallback to old structure
  const fulfillmentDetails = useFormValue(['fulfillmentDetails']) as any
  const oldFulfillment = useFormValue(['fulfillment']) as any

  const totalAmount = useFormValue(['totalAmount']) as number
  let amountSubtotal = useFormValue(['amountSubtotal']) as number
  let amountTax = useFormValue(['amountTax']) as number
  let amountShipping = useFormValue(['amountShipping']) as number
  const amountDiscount = useFormValue(['amountDiscount']) as number

  const cart = useFormValue(['cart']) as any[]
  const fulfillmentNotes =
    fulfillmentDetails?.fulfillmentNotes || oldFulfillment?.fulfillmentNotes || ''
  const [localNotes, setLocalNotes] = useState(fulfillmentNotes || '')
  const [isSaving, setIsSaving] = useState(false)
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalNotes(fulfillmentNotes || '')
    setIsSaving(false)
  }, [fulfillmentNotes])

  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current)
      }
    }
  }, [])

  const debouncedOnChange = useCallback(
    (value: string) => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current)
      }

      debounceTimeout.current = setTimeout(() => {
        onChange(
          value
            ? set(value, ['fulfillmentDetails', 'fulfillmentNotes'])
            : unset(['fulfillmentDetails', 'fulfillmentNotes']),
        )
        setIsSaving(false)
      }, 500)
    },
    [onChange],
  )

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.currentTarget.value
      setLocalNotes(newValue)
      setIsSaving(true)
      debouncedOnChange(newValue)
    },
    [debouncedOnChange],
  )

  // Calculate subtotal from cart if not available
  if (!amountSubtotal && cart && cart.length > 0) {
    amountSubtotal = cart.reduce((sum, item) => {
      const itemTotal = item.total || (item.price || 0) * (item.quantity || 1)
      return sum + itemTotal
    }, 0)
  }

  // Calculate shipping and tax from total if not available
  if (totalAmount && amountSubtotal) {
    if (!amountShipping && !amountTax) {
      amountShipping = totalAmount - amountSubtotal
      amountTax = 0
    }
  }

  // Format date
  const formattedDate = createdAt ? format(new Date(createdAt), 'MMMM d, yyyy') : 'Unknown date'

  const badges = buildOrderStatusBadges({
    paymentStatus,
    stripePaymentIntentStatus,
    orderStatus: status,
  })

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

            {/* Status Line: Date | Badges */}
            <Flex align="center" gap={3} wrap="wrap">
              <Text size={[1, 1, 2, 3]} muted>
                {formattedDate}
              </Text>
              {badges.length > 0 && (
                <>
                  <Text size={[1, 1, 2, 3]} muted>
                    |
                  </Text>
                  <Inline space={2}>
                    {badges.map((badge) => (
                      <DocumentBadge
                        key={badge.key}
                        label={badge.label}
                        tone={badge.tone}
                        title={badge.title}
                      />
                    ))}
                  </Inline>
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

            {/* Order Totals */}
            <Box paddingTop={3} style={{borderTop: '1px solid var(--card-border-color)'}}>
              <Stack space={2}>
                {amountSubtotal !== undefined && amountSubtotal !== null && (
                  <Flex justify="space-between">
                    <Text size={[1, 1, 2]} muted>
                      Subtotal:
                    </Text>
                    <Text size={[1, 1, 2]} muted>
                      ${amountSubtotal.toFixed(2)}
                    </Text>
                  </Flex>
                )}

                {amountDiscount !== undefined && amountDiscount !== null && amountDiscount > 0 && (
                  <Flex justify="space-between">
                    <Text
                      size={[1, 1, 2]}
                      muted
                      style={{color: 'var(--card-badge-caution-fg-color)'}}
                    >
                      Discount:
                    </Text>
                    <Text
                      size={[1, 1, 2]}
                      muted
                      style={{color: 'var(--card-badge-caution-fg-color)'}}
                    >
                      -${amountDiscount.toFixed(2)}
                    </Text>
                  </Flex>
                )}

                {amountShipping !== undefined && amountShipping !== null && amountShipping > 0 && (
                  <Flex justify="space-between">
                    <Text size={[1, 1, 2]} muted>
                      Shipping:
                    </Text>
                    <Text size={[1, 1, 2]} muted>
                      ${amountShipping.toFixed(2)}
                    </Text>
                  </Flex>
                )}

                {amountTax !== undefined && amountTax !== null && amountTax > 0 && (
                  <Flex justify="space-between">
                    <Text size={[1, 1, 2]} muted>
                      Tax:
                    </Text>
                    <Text size={[1, 1, 2]} muted>
                      ${amountTax.toFixed(2)}
                    </Text>
                  </Flex>
                )}

                <Flex justify="space-between" paddingTop={2}>
                  <Text size={[2, 2, 3]} weight="bold">
                    Total:
                  </Text>
                  <Text size={[2, 2, 3]} weight="bold">
                    ${totalAmount?.toFixed(2) || '0.00'}
                  </Text>
                </Flex>
              </Stack>
            </Box>
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
              onChange={handleChange}
              padding={[3, 3, 4]}
              placeholder="Add internal notes about this order..."
              value={localNotes}
              rows={4}
            />
            <Text size={1} muted>
              {isSaving ? 'Saving...' : 'Saved'}
            </Text>
          </Stack>
        </Card>
      </Container>
    </Stack>
  )
}
