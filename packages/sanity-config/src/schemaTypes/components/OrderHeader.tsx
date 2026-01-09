// schemas/components/OrderHeader.tsx

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Container,
  Card,
  Text,
  Box,
  Stack,
  TextArea,
  Flex,
  Inline,
  Tab,
  TabList,
  TabPanel,
} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {PatchEvent, set, unset} from 'sanity'
import {format} from 'date-fns'
import {ShippingDetails} from './ShippingDetails'
import {
  DocumentBadge,
  buildOrderStatusBadges,
} from '../../components/studio/documentTables/DocumentBadge'
import {sanitizeCartItemName} from '../../utils/cartItemDetails'
import {
  buildWorkflowBadges,
  deriveWorkflowState,
  resolveWorkflowActionBadge,
} from '../../utils/orderWorkflow'

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

  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('overview')

  // Get order data from form
  const orderNumber = useFormValue(['orderNumber']) as string
  const createdAt = useFormValue(['createdAt']) as string
  const status = useFormValue(['status']) as string
  const orderType = useFormValue(['orderType']) as string
  const paymentStatus = useFormValue(['paymentStatus']) as string
  const labelPurchased = useFormValue(['labelPurchased']) as boolean
  const shippedAt = useFormValue(['shippedAt']) as string
  const deliveredAt = useFormValue(['deliveredAt']) as string
  const customerInstructions = useFormValue(['customerInstructions']) as string
  const opsInternalNotes = useFormValue(['opsInternalNotes']) as string

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
  const [localCustomerInstructions, setLocalCustomerInstructions] = useState(
    customerInstructions || '',
  )
  const [localOpsNotes, setLocalOpsNotes] = useState(opsInternalNotes || '')
  const [isSavingCustomerInstructions, setIsSavingCustomerInstructions] = useState(false)
  const [isSavingOpsNotes, setIsSavingOpsNotes] = useState(false)

  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerInstructionsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opsNotesTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Cleanup effect
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
    setLocalCustomerInstructions(customerInstructions || '')
    setIsSavingCustomerInstructions(false)
  }, [customerInstructions])

  useEffect(() => {
    setLocalOpsNotes(opsInternalNotes || '')
    setIsSavingOpsNotes(false)
  }, [opsInternalNotes])

  useEffect(() => {
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current)
      if (customerInstructionsTimeout.current) clearTimeout(customerInstructionsTimeout.current)
      if (opsNotesTimeout.current) clearTimeout(opsNotesTimeout.current)
    }
  }, [])

  // Debounced handlers
  const debouncedOnChange = useCallback(
    (value: string) => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current)
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

  const debouncedCustomerInstructionsChange = useCallback(
    (value: string) => {
      if (customerInstructionsTimeout.current) clearTimeout(customerInstructionsTimeout.current)
      customerInstructionsTimeout.current = setTimeout(() => {
        onChange(value ? set(value, ['customerInstructions']) : unset(['customerInstructions']))
        setIsSavingCustomerInstructions(false)
      }, 500)
    },
    [onChange],
  )

  const debouncedOpsNotesChange = useCallback(
    (value: string) => {
      if (opsNotesTimeout.current) clearTimeout(opsNotesTimeout.current)
      opsNotesTimeout.current = setTimeout(() => {
        onChange(value ? set(value, ['opsInternalNotes']) : unset(['opsInternalNotes']))
        setIsSavingOpsNotes(false)
      }, 500)
    },
    [onChange],
  )

  const handleCustomerInstructionsChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.currentTarget.value
      setLocalCustomerInstructions(newValue)
      setIsSavingCustomerInstructions(true)
      debouncedCustomerInstructionsChange(newValue)
    },
    [debouncedCustomerInstructionsChange],
  )

  const handleOpsNotesChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.currentTarget.value
      setLocalOpsNotes(newValue)
      setIsSavingOpsNotes(true)
      debouncedOpsNotesChange(newValue)
    },
    [debouncedOpsNotesChange],
  )

  // Calculate totals
  if (!amountSubtotal && cart && cart.length > 0) {
    amountSubtotal = cart.reduce((sum, item) => {
      const itemTotal = item.total || (item.price || 0) * (item.quantity || 1)
      return sum + itemTotal
    }, 0)
  }

  if (totalAmount && amountSubtotal) {
    if (!amountShipping && !amountTax) {
      amountShipping = totalAmount - amountSubtotal
      amountTax = 0
    }
  }

  const formattedDate = createdAt ? format(new Date(createdAt), 'MMMM d, yyyy') : 'Unknown date'

  const badges = buildOrderStatusBadges({
    paymentStatus,
    orderStatus: status,
    labelPurchased,
    shippedAt,
    deliveredAt,
    includeWorkflowBadges: false,
  })

  const workflowState = deriveWorkflowState({
    paymentStatus,
    labelPurchased,
    shippedAt,
    deliveredAt,
  })

  const showWorkflowBadges = orderType === 'wholesale'

  const workflowBadges = buildWorkflowBadges({
    paymentStatus,
    labelPurchased,
    shippedAt,
    deliveredAt,
  })

  const actionBadge = resolveWorkflowActionBadge({
    paymentStatus,
    labelPurchased,
    shippedAt,
    deliveredAt,
  })

  return (
    <Stack space={4}>
      {/* ORDER HEADER CARD - Always visible */}
      <Container width={1}>
        <Card padding={4} border radius={2} shadow={1}>
          <Stack space={3}>
            <Flex align="center" gap={3} wrap="wrap">
              <Text size={[2, 2, 3, 4]} weight="bold">
                Order #{orderNumber || 'New Order'}
              </Text>
            </Flex>

            {/* Status Line */}
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

            {showWorkflowBadges && (
              <Stack space={2}>
                <Flex align="center" gap={3}>
                  <Text size={[1, 1, 2]} weight="semibold" muted>
                    Workflow
                  </Text>
                  <Inline space={2}>
                    <DocumentBadge
                      label={workflowState.label}
                      tone={workflowState.tone}
                      title="Derived workflow state (display only)"
                    />
                    {actionBadge && (
                      <DocumentBadge
                        label={actionBadge.label}
                        tone={actionBadge.tone}
                        title={actionBadge.title}
                      />
                    )}
                  </Inline>
                </Flex>

                {workflowBadges.length > 0 && (
                  <Inline space={2}>
                    {workflowBadges.map((badge) => (
                      <DocumentBadge
                        key={badge.key}
                        label={badge.label}
                        tone={badge.tone}
                        title={badge.title}
                      />
                    ))}
                  </Inline>
                )}
              </Stack>
            )}

          </Stack>
        </Card>
      </Container>

      {/* MAIN TABBED INTERFACE */}
      <Container width={1}>
        <Card border radius={2}>
          <TabList space={0}>
            <Tab
              id="overview-tab"
              label="Overview"
              selected={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              aria-controls="overview-panel"
            />
            <Tab
              id="shipping-tab"
              label="Shipping & Fulfillment"
              selected={activeTab === 'shipping'}
              onClick={() => setActiveTab('shipping')}
              aria-controls="shipping-panel"
            />
            <Tab
              id="notes-tab"
              label="Notes & Instructions"
              selected={activeTab === 'notes'}
              onClick={() => setActiveTab('notes')}
              aria-controls="notes-panel"
            />
          </TabList>

          {/* TAB 1: OVERVIEW */}
          <TabPanel
            id="overview-panel"
            aria-labelledby="overview-tab"
            hidden={activeTab !== 'overview'}
          >
            <Stack space={4} padding={4}>
              {/* Order Items Section */}
              {cart && cart.length > 0 && (
                <Card padding={3} border radius={2}>
                  <Stack space={3}>
                    <Text size={[2, 2, 3]} weight="bold">
                      Order Items
                    </Text>

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
                          : itemSubtotal / (item.quantity || 1)

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
                </Card>
              )}

              {/* Pricing Summary */}
              <Card padding={3} border radius={2}>
                <Stack space={2}>
                  <Text size={[2, 2, 3]} weight="bold">
                    Order Summary
                  </Text>

                  <Flex justify="space-between">
                    <Text size={[1, 1, 2]} muted>
                      Subtotal:
                    </Text>
                    <Text size={[1, 1, 2]} muted>
                      ${(Number(amountSubtotal) || computedSubtotal).toFixed(2)}
                    </Text>
                  </Flex>

                  {amountDiscount !== undefined &&
                    amountDiscount !== null &&
                    amountDiscount > 0 && (
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

                  {amountShipping !== undefined &&
                    amountShipping !== null &&
                    amountShipping > 0 && (
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

                  <Box style={{borderTop: '1px solid var(--card-border-color)'}} paddingTop={2}>
                    <Flex justify="space-between">
                      <Text size={[2, 2, 3]} weight="bold">
                        Total:
                      </Text>
                      <Text size={[2, 2, 3]} weight="bold">
                        ${(Number(totalAmount) || computedTotal).toFixed(2)}
                      </Text>
                    </Flex>

                    {hasDiscrepancy && (
                      <Text
                        size={1}
                        muted
                        style={{
                          color: 'var(--card-badge-caution-fg-color)',
                          marginTop: '0.5rem',
                        }}
                      >
                        Calculated total {computedTotal.toFixed(2)} differs from stored value{' '}
                        {(totalAmount || 0).toFixed(2)}.
                      </Text>
                    )}
                  </Box>
                </Stack>
              </Card>
            </Stack>
          </TabPanel>

          {/* TAB 2: SHIPPING & FULFILLMENT */}
          <TabPanel
            id="shipping-panel"
            aria-labelledby="shipping-tab"
            hidden={activeTab !== 'shipping'}
          >
            <Stack space={4} padding={4}>
              <ShippingDetails />

              <Card padding={3} border radius={2}>
                <Stack space={3}>
                  <Text size={[2, 2, 3]} weight="bold">
                    Fulfillment Notes
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
            </Stack>
          </TabPanel>

          {/* TAB 3: NOTES & INSTRUCTIONS */}
          <TabPanel id="notes-panel" aria-labelledby="notes-tab" hidden={activeTab !== 'notes'}>
            <Stack space={4} padding={4}>
              <Card padding={3} border radius={2}>
                <Stack space={3}>
                  <Text size={[2, 2, 3]} weight="bold">
                    Customer Instructions (Internal)
                  </Text>
                  <TextArea
                    fontSize={[2, 2, 3, 4]}
                    onChange={handleCustomerInstructionsChange}
                    padding={[3, 3, 4]}
                    placeholder="Delivery notes, gate codes, or drop-off requests..."
                    value={localCustomerInstructions}
                    rows={3}
                  />
                  <Text size={1} muted>
                    {isSavingCustomerInstructions ? 'Saving...' : 'Saved'}
                  </Text>
                </Stack>
              </Card>

              <Card padding={3} border radius={2}>
                <Stack space={3}>
                  <Text size={[2, 2, 3]} weight="bold">
                    Ops Notes (Internal)
                  </Text>
                  <TextArea
                    fontSize={[2, 2, 3, 4]}
                    onChange={handleOpsNotesChange}
                    padding={[3, 3, 4]}
                    placeholder="Internal ops/support context..."
                    value={localOpsNotes}
                    rows={4}
                  />
                  <Text size={1} muted>
                    {isSavingOpsNotes ? 'Saving...' : 'Saved'}
                  </Text>
                </Stack>
              </Card>
            </Stack>
          </TabPanel>
        </Card>
      </Container>
    </Stack>
  )
}
