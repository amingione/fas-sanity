// schemas/components/OrderHeader.tsx
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Container, Card, Text, Box, Stack, TextArea, Flex, Inline} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {PatchEvent, set, unset} from 'sanity'
import {format} from 'date-fns'
import {ShippingDetails} from './ShippingDetails'
import {
  DocumentBadge,
  buildOrderStatusBadges,
} from '../../components/studio/documentTables/DocumentBadge'
import {sanitizeCartItemName} from '../../utils/cartItemDetails'

const parseUpgradeAmount = (value?: unknown): number => {
  if (typeof value !== 'string') return 0
  const match = value.match(/-?\$?\s*([\d,]+(?:\.\d+)?)/)
  if (!match?.[1]) return 0
  const parsed = Number.parseFloat(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const computeUpgradeTotal = (item: any): number => {
  if (typeof item?.upgradesTotal === 'number' && Number.isFinite(item.upgradesTotal)) {
    return item.upgradesTotal
  }
  const fromUpgrades = Array.isArray(item?.upgrades)
    ? item.upgrades.reduce((sum: number, entry: unknown) => sum + parseUpgradeAmount(entry), 0)
    : 0
  return fromUpgrades
}

const computeItemSubtotal = (item: any): number => {
  const quantity = Number.isFinite(item?.quantity) && item.quantity > 0 ? item.quantity : 1
  const base = typeof item?.price === 'number' ? item.price * quantity : 0
  const upgrades = computeUpgradeTotal(item)
  const totals = [item?.total, item?.lineTotal]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map(Number)
  const explicit = totals.length ? Math.max(...totals) : undefined
  return explicit !== undefined ? explicit : base + upgrades
}

const formatOptions = (item: any): string | null => {
  const parts = new Set<string>()

  const push = (value?: unknown) => {
    if (!value) return
    const raw = String(value).trim()
    if (!raw) return
    parts.add(raw)
  }

  if (typeof item?.optionSummary === 'string') {
    item.optionSummary
      .split(/[,•]/)
      .map((segment: string) => segment.trim())
      .filter(Boolean)
      .forEach(push)
  }

  if (Array.isArray(item?.optionDetails)) {
    item.optionDetails.map((opt: unknown) => push(opt)).forEach(() => undefined)
  }

  if (typeof item?.selectedVariant === 'string') {
    push(item.selectedVariant)
  }

  const cleaned = Array.from(parts)
  return cleaned.length ? cleaned.join(', ') : null
}

const computeOrderSubtotal = (cart: any[] | undefined | null): number =>
  (cart || []).reduce((sum, item) => sum + computeItemSubtotal(item), 0)

export function OrderHeader(props: any) {
  const {onChange, value} = props

  // Get order data from form
  const orderNumber = useFormValue(['orderNumber']) as string
  const createdAt = useFormValue(['createdAt']) as string
  const status = useFormValue(['status']) as string
  const paymentStatus = useFormValue(['paymentStatus']) as string

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
  const computedSubtotal = useMemo(() => computeOrderSubtotal(cart), [cart])
  const computedTotal = useMemo(
    () =>
      (computedSubtotal || 0) + (amountShipping || 0) + (amountTax || 0) - (amountDiscount || 0),
    [amountDiscount, amountShipping, amountTax, computedSubtotal],
  )
  const hasDiscrepancy =
    typeof totalAmount === 'number' &&
    Number.isFinite(totalAmount) &&
    Math.abs(totalAmount - computedTotal) > 0.01

  // Clean up legacy documents where orderHeaderDisplay stored object data instead of a string
  useEffect(() => {
    if (!value || typeof value !== 'object') return

    const legacyNotes = (value as any)?.fulfillmentDetails?.fulfillmentNotes
    const patchList = legacyNotes
      ? [set(legacyNotes, ['fulfillmentDetails', 'fulfillmentNotes']), unset()]
      : [unset()]
    onChange(PatchEvent.from(patchList))
  }, [onChange, value])

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
                  const displayName =
                    sanitizeCartItemName(item.productName) ||
                    sanitizeCartItemName(item.name) ||
                    item.productName ||
                    item.name ||
                    'Unknown Product'
                  const optionsText = formatOptions(item)
                  const upgradesText = Array.isArray(item.upgrades)
                    ? item.upgrades.filter(Boolean).join(', ')
                    : item.addOns?.join(', ')
                  const itemSubtotal = computeItemSubtotal(item)
                  const unitPrice =
                    typeof item.price === 'number' && Number.isFinite(item.price)
                      ? item.price
                      : itemSubtotal / (item.quantity || 1 || 1)

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

                        {upgradesText && (
                          <Text size={1} muted>
                            Upgrades: {upgradesText}
                          </Text>
                        )}

                        <Text size={2} weight="medium">
                          Qty: {item.quantity || 1} × ${unitPrice.toFixed(2)} = $
                          {itemSubtotal.toFixed(2)}
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
                <Flex justify="space-between">
                  <Text size={[1, 1, 2]} muted>
                    Subtotal:
                  </Text>
                  <Text size={[1, 1, 2]} muted>
                    ${(Number(amountSubtotal) || computedSubtotal).toFixed(2)}
                  </Text>
                </Flex>

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
                    ${(Number(totalAmount) || computedTotal).toFixed(2)}
                  </Text>
                </Flex>
                {hasDiscrepancy && (
                  <Text size={1} muted style={{color: 'var(--card-badge-caution-fg-color)'}}>
                    Calculated total {computedTotal.toFixed(2)} differs from stored value{' '}
                    {(totalAmount || 0).toFixed(2)}.
                  </Text>
                )}
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
