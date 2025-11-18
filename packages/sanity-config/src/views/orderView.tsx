import {
  BasketIcon,
  BillIcon,
  CheckmarkCircleIcon,
  DocumentIcon,
  LaunchIcon,
  PackageIcon,
  PinIcon,
  TrolleyIcon,
  UserIcon,
  WarningOutlineIcon,
} from '@sanity/icons'
import {Box, Button, Card, Flex, Inline, Select, Spinner, Stack, Text, TextInput, useToast} from '@sanity/ui'
import type {ComponentType} from 'react'
import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {FormField, FormInput, useClient, useDocumentOperation} from 'sanity'
import type {DocumentViewComponent} from 'sanity/desk'
import {IntentLink} from 'sanity/router'
import EditableFieldWrapper from '../components/EditableFieldWrapper'
import OrderItemsList from '../components/OrderItemsList'
import OrderSection from '../components/OrderSection'
import OrderStatusBadge from '../components/OrderStatusBadge'
import type {
  OrderDocument,
  OrderStatus,
  OrderViewConfig,
  OrderViewField,
  OrderViewSection,
  ShippingAddress,
} from '../types/order'
import {ORDER_VIEW_CONFIG_DOCUMENT_ID} from '../types/order'

type OrderViewConfigResult = {
  orderViewConfig?: OrderViewConfig
}

const ORDER_VIEW_QUERY = `*[_id == $configId][0]{orderViewConfig}`

const DEFAULT_ORDER_VIEW_CONFIG: OrderViewConfig = {
  editableFields: ['status', 'manualTrackingNumber'],
  hiddenFields: ['metadata', 'stripeMetadata', 'webhookData', 'rawPaymentData'],
  protectedFields: [
    'orderNumber',
    'createdAt',
    'customerEmail',
    'customerRef',
    'cart',
    'totalAmount',
    'amountSubtotal',
    'amountTax',
    'amountDiscount',
    'amountShipping',
    'paymentStatus',
    'paymentIntentId',
    'stripeSessionId',
    'cardBrand',
    'cardLast4',
    'receiptUrl',
    'invoiceRef',
    'currency',
    'trackingNumber',
    'trackingUrl',
    'shippingLabelUrl',
    'packingSlipUrl',
    'fulfilledAt',
    'shippingAddress',
  ],
  sections: [
    {
      _key: 'orderInfo',
      title: 'Order Information',
      collapsed: false,
      fields: [
        {
          _key: 'orderNumber',
          fieldName: 'orderNumber',
          label: 'Order Number',
          type: 'string',
          prominent: true,
          readOnly: true,
        },
        {
          _key: 'status',
          fieldName: 'status',
          label: 'Order Status',
          type: 'string',
          prominent: true,
          editable: true,
          options: ['paid', 'fulfilled', 'shipped', 'cancelled', 'refunded'],
        },
        {
          _key: 'createdAt',
          fieldName: 'createdAt',
          label: 'Order Date',
          type: 'datetime',
        },
        {
          _key: 'fulfilledAt',
          fieldName: 'fulfilledAt',
          label: 'Fulfilled Date',
          type: 'datetime',
        },
      ],
    },
    {
      _key: 'customer',
      title: 'Customer Information',
      collapsed: false,
      fields: [
        {fieldName: 'customerName', label: 'Customer Name', type: 'string'},
        {fieldName: 'customerEmail', label: 'Email', type: 'string'},
        {
          fieldName: 'customerRef',
          label: 'Customer Reference',
          type: 'reference',
          note: 'Do not modify - linked to customer record',
        },
      ],
    },
    {
      _key: 'items',
      title: 'Order Items',
      collapsed: false,
      fields: [
        {
          fieldName: 'cart',
          label: 'Cart Items',
          type: 'array',
          note: 'Read-only - synced from payment processor',
        },
      ],
    },
    {
      _key: 'payment',
      title: 'Payment Details',
      collapsed: true,
      fields: [
        {fieldName: 'totalAmount', label: 'Total Amount', type: 'number', prominent: true},
        {fieldName: 'amountSubtotal', label: 'Subtotal', type: 'number'},
        {fieldName: 'amountTax', label: 'Tax', type: 'number'},
        {fieldName: 'amountDiscount', label: 'Discounts', type: 'number'},
        {fieldName: 'amountShipping', label: 'Shipping', type: 'number'},
        {fieldName: 'currency', label: 'Currency', type: 'string'},
        {fieldName: 'paymentStatus', label: 'Payment Status', type: 'string'},
        {
          fieldName: 'paymentIntentId',
          label: 'Payment Intent ID',
          type: 'string',
          note: 'Stripe Payment Intent - do not modify',
        },
        {
          fieldName: 'stripeSessionId',
          label: 'Stripe Session ID',
          type: 'string',
          note: 'Stripe Checkout Session - do not modify',
        },
        {fieldName: 'cardBrand', label: 'Card Brand', type: 'string'},
        {fieldName: 'cardLast4', label: 'Card Last 4', type: 'string'},
        {fieldName: 'receiptUrl', label: 'Receipt URL', type: 'url'},
        {
          fieldName: 'invoiceRef',
          label: 'Invoice Reference',
          type: 'reference',
          note: 'Do not modify - linked to invoice record',
        },
      ],
    },
    {
      _key: 'fulfillment',
      title: 'Fulfillment & Tracking',
      collapsed: false,
      fields: [
        {
          fieldName: 'manualTrackingNumber',
          label: 'Tracking Number (Manual Entry)',
          type: 'string',
          editable: true,
          note: 'Add tracking number to mark order as fulfilled',
        },
        {fieldName: 'trackingNumber', label: 'Tracking Number (Auto)', type: 'string'},
        {fieldName: 'trackingUrl', label: 'Tracking URL', type: 'url'},
        {fieldName: 'shippingLabelUrl', label: 'Shipping Label', type: 'url'},
        {fieldName: 'packingSlipUrl', label: 'Packing Slip', type: 'url'},
      ],
    },
    {
      _key: 'shipping',
      title: 'Shipping Address',
      collapsed: true,
      fields: [
        {
          fieldName: 'shippingAddress',
          label: 'Shipping Address',
          type: 'object',
          displayFields: [
            'name',
            'addressLine1',
            'addressLine2',
            'city',
            'state',
            'postalCode',
            'country',
            'phone',
            'email',
          ],
        },
      ],
    },
  ],
  viewSettings: {
    defaultCollapsedSections: ['payment', 'shipping'],
    hideComplexMetadata: true,
    preserveStripeSync: true,
    prominentFields: ['orderNumber', 'status', 'totalAmount', 'manualTrackingNumber'],
  },
}

const SECTION_ICONS: Record<string, ComponentType> = {
  orderInfo: DocumentIcon,
  customer: UserIcon,
  items: BasketIcon,
  payment: BillIcon,
  fulfillment: PackageIcon,
  shipping: PinIcon,
}

const EDITABLE_FIELD_WHITELIST = new Set(['status', 'manualTrackingNumber'])

const ORDER_STATUS_OPTIONS: OrderStatus[] = ['paid', 'fulfilled', 'shipped', 'cancelled', 'refunded']

const STRIPE_SYNC_FIELDS = new Set([
  'paymentIntentId',
  'stripeSessionId',
  'paymentStatus',
  'totalAmount',
  'amountSubtotal',
  'amountTax',
  'amountDiscount',
  'amountShipping',
  'cardBrand',
  'cardLast4',
  'currency',
  'receiptUrl',
  'invoiceRef',
  'trackingNumber',
  'trackingUrl',
  'shippingLabelUrl',
  'packingSlipUrl',
])

const REFERENCE_TARGETS: Record<string, string> = {
  customerRef: 'customer',
  invoiceRef: 'invoice',
}

export const orderView: DocumentViewComponent = (props) => {
  const {documentId, schemaType, document} = props
  const order = (document?.displayed || {}) as OrderDocument
  const client = useClient({apiVersion: '2024-10-01'})
  const schemaTypeName = schemaType?.name || 'order'
  const {patch} = useDocumentOperation(documentId, schemaTypeName)
  const {push: pushToast} = useToast()

  const [config, setConfig] = useState<OrderViewConfig>(DEFAULT_ORDER_VIEW_CONFIG)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [statusDraft, setStatusDraft] = useState<OrderStatus | ''>(order.status ?? '')
  const [manualTrackingDraft, setManualTrackingDraft] = useState(order.manualTrackingNumber ?? '')

  useEffect(() => {
    setStatusDraft(order.status ?? '')
  }, [order.status])

  useEffect(() => {
    setManualTrackingDraft(order.manualTrackingNumber ?? '')
  }, [order.manualTrackingNumber])

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      try {
        const response = await client.fetch<OrderViewConfigResult>(ORDER_VIEW_QUERY, {
          configId: ORDER_VIEW_CONFIG_DOCUMENT_ID,
        })
        if (cancelled) return
        if (response?.orderViewConfig) {
          setConfig(response.orderViewConfig)
        } else {
          setConfig(DEFAULT_ORDER_VIEW_CONFIG)
        }
      } catch (error) {
        console.warn('Failed to load order view configuration', error)
        if (!cancelled) {
          setConfig(DEFAULT_ORDER_VIEW_CONFIG)
        }
      } finally {
        if (!cancelled) {
          setLoadingConfig(false)
        }
      }
    }
    loadConfig()
    return () => {
      cancelled = true
    }
  }, [client])

  useEffect(() => {
    setCollapsedSections((prev) => {
      const next = {...prev}
      config.sections.forEach((section) => {
        const key = section._key || section.title
        if (!(key in next)) {
          next[key] = section.collapsed ?? false
        }
      })
      return next
    })
  }, [config])

  const hiddenFields = useMemo(
    () =>
      new Set([
        ...(config.hiddenFields || []),
        'metadata',
        'stripeMetadata',
        'webhookData',
        'rawPaymentData',
        'metadataEntries',
      ]),
    [config.hiddenFields],
  )

  const editableFields = useMemo(
    () => new Set(config.editableFields?.length ? config.editableFields : DEFAULT_ORDER_VIEW_CONFIG.editableFields),
    [config.editableFields],
  )

  const protectedFields = useMemo(
    () => new Set([...(config.protectedFields || []), ...STRIPE_SYNC_FIELDS]),
    [config.protectedFields],
  )

  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSections((prev) => ({...prev, [sectionKey]: !prev[sectionKey]}))
  }, [])

  const formatCurrency = useMemo(() => {
    const currency = order.currency || 'USD'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    })
  }, [order.currency])

  const formatDateTime = useCallback((value?: string | null) => {
    if (!value) return '—'
    try {
      return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return value
    }
  }, [])

  const handleStatusChange = useCallback(
    (nextValue: string) => {
      const nextStatus = (nextValue as OrderStatus) || ''
      setStatusDraft(nextStatus)
      if (!nextStatus || nextStatus === order.status) return
      patch.execute([{set: {status: nextStatus}}])
      pushToast({
        status: 'success',
        title: 'Status updated',
        description: `Order status changed to ${nextStatus}`,
      })
    },
    [order.status, patch, pushToast],
  )

  const handleManualTrackingCommit = useCallback(() => {
    const trimmed = manualTrackingDraft.trim()
    if (!trimmed && !order.manualTrackingNumber) return
    if (trimmed === order.manualTrackingNumber) return
    if (trimmed) {
      patch.execute([{set: {manualTrackingNumber: trimmed}}])
      pushToast({
        status: 'success',
        title: 'Tracking number saved',
        description: 'Manual tracking number stored on the order',
      })
    } else {
      patch.execute([{unset: ['manualTrackingNumber']}])
      pushToast({
        status: 'warning',
        title: 'Tracking number cleared',
      })
    }
  }, [manualTrackingDraft, order.manualTrackingNumber, patch, pushToast])

  const renderSection = (section: OrderViewSection) => {
    const sectionKey = section._key || section.title
    const visibleFields = section.fields.filter((field) => !hiddenFields.has(field.fieldName as string))
    if (!visibleFields.length) return null

    const IconComponent = SECTION_ICONS[sectionKey] || DocumentIcon
    const collapsed = collapsedSections[sectionKey] ?? section.collapsed ?? false

    return (
      <OrderSection
        key={sectionKey}
        title={section.title}
        icon={IconComponent}
        isCollapsed={collapsed}
        onToggle={() => toggleSection(sectionKey)}
        fieldCount={visibleFields.length}
      >
        {visibleFields.map((field) => renderField(field))}
      </OrderSection>
    )
  }

  const getFieldDescription = (field: OrderViewField) => {
    const isStripeLocked = protectedFields.has(field.fieldName as string)
    if (!field.note && !isStripeLocked) return undefined
    return (
      <Stack space={2}>
        {field.note && <Text size={1}>{field.note}</Text>}
        {isStripeLocked && (
          <Inline space={2} align="center">
            <WarningOutlineIcon style={{fontSize: 14}} />
            <Text size={1} muted>
              Synced from Stripe. Editing is disabled.
            </Text>
          </Inline>
        )}
      </Stack>
    )
  }

  const formatAddressLabel = (value: string) =>
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/(\d+)/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, (match) => match.toUpperCase())

  const renderShippingAddress = (field: OrderViewField) => {
    const value = order.shippingAddress
    const fieldsToShow = field.displayFields || [
      'name',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
      'phone',
      'email',
    ]
    return (
      <FormField key={field.fieldName} title={field.label} description={getFieldDescription(field)}>
        <FormInput>
          <Card padding={3} radius={2} tone="transparent" border>
            {fieldsToShow.map((fieldName) => (
              <Flex key={fieldName} justify="space-between" style={{gap: 8}}>
                <Text size={1} muted>
                  {formatAddressLabel(fieldName)}
                </Text>
                <Text size={2}>
                  {(value as ShippingAddress | undefined)?.[fieldName as keyof ShippingAddress] || '—'}
                </Text>
              </Flex>
            ))}
          </Card>
        </FormInput>
      </FormField>
    )
  }

  const renderReferenceField = (field: OrderViewField) => {
    const refValue = order[field.fieldName as keyof OrderDocument] as {_ref?: string} | undefined
    const targetType = REFERENCE_TARGETS[field.fieldName as string]
    const description =
      getFieldDescription(field) ||
      (targetType ? (
        <Text size={1} muted>
          Linked {targetType} reference
        </Text>
      ) : undefined)
    return (
      <FormField key={field.fieldName} title={field.label} description={description}>
        <FormInput>
          {refValue?._ref ? (
            <IntentLink
              intent="edit"
              params={{id: refValue._ref, type: targetType || schemaTypeName}}
              style={{display: 'inline-flex'}}
            >
              <Button icon={LaunchIcon} text="Open document" tone="primary" mode="bleed" />
            </IntentLink>
          ) : (
            <Text size={1} muted>
              Not linked
            </Text>
          )}
        </FormInput>
      </FormField>
    )
  }

  const renderUrlField = (field: OrderViewField) => {
    const value = order[field.fieldName as keyof OrderDocument] as string | undefined
    return (
      <FormField key={field.fieldName} title={field.label} description={getFieldDescription(field)}>
        <FormInput>
          {value ? (
            <Button
              as="a"
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              text="Open link"
              icon={LaunchIcon}
              tone="primary"
              mode="bleed"
            />
          ) : (
            <Text size={1} muted>
              Not available
            </Text>
          )}
        </FormInput>
      </FormField>
    )
  }

  const renderStatusField = (field: OrderViewField) => (
    <EditableFieldWrapper
      key={field.fieldName}
      label={field.label}
      description={getFieldDescription(field)}
    >
      <Select value={statusDraft} onChange={(event) => handleStatusChange(event.currentTarget.value)}>
        <option value="">Select status</option>
        {ORDER_STATUS_OPTIONS.map((statusOption) => (
          <option key={statusOption} value={statusOption}>
            {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
          </option>
        ))}
      </Select>
    </EditableFieldWrapper>
  )

  const renderManualTrackingField = (field: OrderViewField) => (
    <Stack key={field.fieldName} space={3}>
      <EditableFieldWrapper label={field.label} description={getFieldDescription(field)}>
        <TextInput
          value={manualTrackingDraft}
          onChange={(event) => setManualTrackingDraft(event.currentTarget.value)}
          onBlur={handleManualTrackingCommit}
          placeholder="Enter tracking number"
        />
      </EditableFieldWrapper>
      {order.manualTrackingNumber && (
        <Inline space={3} align="center">
          <CheckmarkCircleIcon style={{color: 'var(--card-fg-color)', fontSize: 16}} />
          <Card paddingX={3} paddingY={2} radius={2} tone="positive" border>
            <Text size={1}>Tracking saved</Text>
          </Card>
        </Inline>
      )}
    </Stack>
  )

  const renderDefaultField = (field: OrderViewField) => {
    const fieldName = field.fieldName as keyof OrderDocument
    const value = order[fieldName]
    const isStripeLocked = protectedFields.has(field.fieldName as string)

    const title = <Text>{field.label}</Text>

    const descriptionContent = getFieldDescription(field)

    let displayValue: string = ''
    if (typeof value === 'number' && field.type === 'number') {
      displayValue = formatCurrency.format(value)
    } else if (field.type === 'datetime') {
      displayValue = formatDateTime(value as string)
    } else if (typeof value === 'string') {
      displayValue = value
    } else if (value === undefined || value === null) {
      displayValue = '—'
    } else {
      displayValue = JSON.stringify(value)
    }

    return (
      <FormField key={field.fieldName} title={title} description={descriptionContent}>
        <FormInput>
          <TextInput value={displayValue} readOnly />
        </FormInput>
      </FormField>
    )
  }

  const renderField = (field: OrderViewField) => {
    if (field.fieldName === 'cart') {
      return (
        <FormField
          key={field.fieldName}
          title={field.label}
          description={getFieldDescription(field)}
        >
          <FormInput>
            <OrderItemsList items={order.cart} currency={order.currency} />
          </FormInput>
        </FormField>
      )
    }

    if (field.fieldName === 'shippingAddress') {
      return renderShippingAddress(field)
    }

    if (field.fieldName === 'status') {
      return renderStatusField(field)
    }

    if (field.fieldName === 'manualTrackingNumber') {
      return renderManualTrackingField(field)
    }

    if (field.type === 'reference') {
      return renderReferenceField(field)
    }

    if (field.type === 'url') {
      return renderUrlField(field)
    }

    return renderDefaultField(field)
  }

  const renderSummaryCards = () => (
    <Flex gap={4} wrap="wrap">
      <Card padding={4} radius={3} shadow={1} border style={{minWidth: 220}}>
        <Text size={1} muted>
          Order number
        </Text>
        <Text size={3} weight="bold">
          {order.orderNumber || 'Not assigned'}
        </Text>
      </Card>
      <Card padding={4} radius={3} shadow={1} border style={{minWidth: 220}}>
        <Text size={1} muted>
          Total amount
        </Text>
        <Text size={3} weight="bold">
          {typeof order.totalAmount === 'number' ? formatCurrency.format(order.totalAmount) : '—'}
        </Text>
      </Card>
      <Card padding={4} radius={3} shadow={1} border style={{minWidth: 220}}>
        <Text size={1} muted>
          Status
        </Text>
        <Box marginTop={2}>
          <OrderStatusBadge status={order.status} />
        </Box>
      </Card>
    </Flex>
  )

  if (!document?.displayed) {
    return (
      <Card padding={4}>
        <Flex align="center" gap={3}>
          <Spinner muted />
          <Text>Loading order...</Text>
        </Flex>
      </Card>
    )
  }

  if (schemaType?.name !== 'order') {
    return (
      <Card padding={4}>
        <Text>This view is only available for order documents.</Text>
      </Card>
    )
  }

  return (
    <Stack space={4} padding={4}>
      {loadingConfig && (
        <Inline space={3} align="center">
          <Spinner size={2} muted />
          <Text size={1}>Loading order view preferences…</Text>
        </Inline>
      )}
      {renderSummaryCards()}
      {config.sections.map((section) => renderSection(section))}
      <Card tone="transparent" padding={3}>
        <Inline space={3} align="center">
          <TrolleyIcon />
          <Text size={1} muted>
            All fields except status and manual tracking are read-only to preserve Stripe syncs.
          </Text>
        </Inline>
      </Card>
    </Stack>
  )
}

export default orderView
