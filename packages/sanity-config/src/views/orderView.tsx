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
import {
  Box,
  Button,
  Card,
  Flex,
  Inline,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import type {ComponentType} from 'react'
import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {FormField, useClient, useDocumentOperation} from 'sanity'
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
  editableFields: ['status', 'fulfillment.trackingNumber', 'fulfillment.status'],
  hiddenFields: [
    'metadata',
    'stripeMetadata',
    'webhookData',
    'rawPaymentData',
    'orderType',
    'slug',
    'customerRef',
    'invoiceData',
    'paymentIntentId',
    'stripeSessionId',
    'currency',
    'trackingNumber',
    'trackingUrl',
    'shippingLabelUrl',
    'packingSlipUrl',
  ],
  protectedFields: [
    'orderNumber',
    'createdAt',
    'customerEmail',
    'customerRef',
    'cart',
    'totalAmount',
    'amountSubtotal',
    'amountTax',
    'amountShipping',
    'paymentStatus',
    'paymentIntentId',
    'stripeSessionId',
    'cardBrand',
    'cardLast4',
    'receiptUrl',
    'invoiceData',
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
      title: 'Order Basics',
      collapsed: false,
      fields: [
        {
          _key: 'orderNumber',
          fieldName: 'orderNumber',
          label: 'Order Number',
          type: 'string',
          prominent: true,
          readOnly: false,
        },
        {
          _key: 'orderType',
          fieldName: 'orderType',
          label: 'Order Type',
          type: 'string',
          hidden: true,
        },
        {
          _key: 'status',
          fieldName: 'status',
          label: 'Order Status',
          type: 'string',
          prominent: true,
          editable: true,
          options: ['paid', 'fulfilled', 'delivered', 'canceled', 'refunded'],
        },
        {
          _key: 'createdAt',
          fieldName: 'createdAt',
          label: 'Order Date',
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
      _key: 'totals',
      title: 'Totals',
      collapsed: false,
      fields: [
        {fieldName: 'totalAmount', label: 'Total Amount', type: 'number', prominent: true},
        {fieldName: 'amountSubtotal', label: 'Subtotal', type: 'number'},
        {fieldName: 'amountTax', label: 'Tax', type: 'number'},
        {fieldName: 'amountShipping', label: 'Shipping', type: 'number'},
      ],
    },
    {
      _key: 'payment',
      title: 'Payment Details',
      collapsed: true,
      fields: [
        {fieldName: 'paymentStatus', label: 'Payment Status', type: 'string'},
        {fieldName: 'cardBrand', label: 'Card Brand', type: 'string'},
        {fieldName: 'cardLast4', label: 'Card Last 4', type: 'string'},
        {fieldName: 'receiptUrl', label: 'Receipt URL', type: 'url'},
      ],
    },
    {
      _key: 'fulfillment',
      title: 'Fulfillment & Tracking',
      collapsed: false,
      fields: [
        {
          fieldName: 'fulfillment.status',
          label: 'Fulfillment Status',
          type: 'string',
          editable: true,
          options: ['unfulfilled', 'shipped', 'delivered'],
        },
        {
          fieldName: 'fulfillment.trackingNumber',
          label: 'Tracking Number',
          type: 'string',
          editable: true,
        },
        {fieldName: 'fulfillment.trackingUrl', label: 'Tracking URL', type: 'url'},
        {fieldName: 'fulfillment.carrier', label: 'Carrier', type: 'string'},
        {fieldName: 'fulfillment.shippedAt', label: 'Shipped Date', type: 'datetime'},
        {fieldName: 'fulfillment.deliveredAt', label: 'Delivered Date', type: 'datetime'},
        {fieldName: 'fulfillment.fulfillmentNotes', label: 'Fulfillment Notes', type: 'string'},
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
    prominentFields: ['orderNumber', 'status', 'totalAmount', 'fulfillment.trackingNumber'],
  },
}

const SECTION_ICONS: Record<string, ComponentType> = {
  orderInfo: DocumentIcon,
  customer: UserIcon,
  items: BasketIcon,
  payment: BillIcon,
  totals: BillIcon,
  fulfillment: PackageIcon,
  shipping: PinIcon,
}

const ORDER_STATUS_OPTIONS: OrderStatus[] = ['paid', 'fulfilled', 'delivered', 'canceled', 'refunded']
const FULFILLMENT_STATUS_OPTIONS = ['unfulfilled', 'shipped', 'delivered']

const STRIPE_SYNC_FIELDS = new Set([
  'paymentIntentId',
  'stripeSessionId',
  'paymentStatus',
  'totalAmount',
  'amountSubtotal',
  'amountTax',
  'amountShipping',
  'cardBrand',
  'cardLast4',
  'currency',
  'receiptUrl',
  'invoiceData',
  'trackingNumber',
  'trackingUrl',
  'shippingLabelUrl',
  'packingSlipUrl',
  'fulfillment.trackingNumber',
  'fulfillment.trackingUrl',
])

const REFERENCE_TARGETS: Record<string, string> = {
  customerRef: 'customer',
}

const OrderViewComponent = (props: any) => {
  const {documentId, schemaType, document} = props
  const order = useMemo(
    () => (document?.displayed || {}) as OrderDocument,
    [document?.displayed],
  )
  const client = useClient({apiVersion: '2024-10-01'})
  const schemaTypeName = schemaType?.name || 'order'
  const {patch} = useDocumentOperation(documentId, schemaTypeName)
  const {push: pushToast} = useToast()

  const [config, setConfig] = useState<OrderViewConfig>(DEFAULT_ORDER_VIEW_CONFIG)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [statusDraft, setStatusDraft] = useState<OrderStatus | ''>(order.status ?? '')
  const [fulfillmentStatusDraft, setFulfillmentStatusDraft] = useState<string>(
    order.fulfillment?.status ?? '',
  )
  const [trackingDraft, setTrackingDraft] = useState(
    order.fulfillment?.trackingNumber ?? order.trackingNumber ?? '',
  )

  useEffect(() => {
    setStatusDraft(order.status ?? '')
  }, [order.status])

  useEffect(() => {
    setFulfillmentStatusDraft(order.fulfillment?.status ?? '')
  }, [order.fulfillment?.status])

  useEffect(() => {
    setTrackingDraft(order.fulfillment?.trackingNumber ?? order.trackingNumber ?? '')
  }, [order.fulfillment?.trackingNumber, order.trackingNumber])

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

  const editableFields = useMemo(() => {
    const configList =
      Array.isArray(config.editableFields) && config.editableFields.length > 0
        ? config.editableFields
        : DEFAULT_ORDER_VIEW_CONFIG.editableFields
    return new Set(configList)
  }, [config.editableFields])

  const protectedFields = useMemo(
    () => new Set([...(config.protectedFields || []), ...STRIPE_SYNC_FIELDS]),
    [config.protectedFields],
  )

  const getFieldValue = useCallback(
    (path: string) =>
      path.split('.').reduce<any>((acc, key) => {
        if (acc === null || acc === undefined) return undefined
        if (typeof acc !== 'object') return undefined
        return (acc as any)[key]
      }, order),
    [order],
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
      if (!editableFields.has('status')) return
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
    [editableFields, order.status, patch, pushToast],
  )

  const handleFulfillmentStatusChange = useCallback(
    (nextValue: string) => {
      if (!editableFields.has('fulfillment.status')) return
      const nextStatus = nextValue || ''
      setFulfillmentStatusDraft(nextStatus)
      const current = order.fulfillment?.status || ''
      if (nextStatus === current) return
      if (nextStatus) {
        patch.execute([{set: {'fulfillment.status': nextStatus}}])
      } else {
        patch.execute([{unset: ['fulfillment.status']}])
      }
      pushToast({
        status: 'success',
        title: 'Fulfillment updated',
        description: `Fulfillment status changed to ${nextStatus || 'unset'}`,
      })
    },
    [editableFields, order.fulfillment?.status, patch, pushToast],
  )

  const handleTrackingCommit = useCallback(() => {
    if (!editableFields.has('fulfillment.trackingNumber')) return
    const trimmed = trackingDraft.trim()
    const current = order.fulfillment?.trackingNumber || order.trackingNumber || ''
    if (!trimmed && !current) return
    if (trimmed === current) return

    if (trimmed) {
      patch.execute([{set: {'fulfillment.trackingNumber': trimmed, trackingNumber: trimmed}}])
      pushToast({
        status: 'success',
        title: 'Tracking number saved',
        description: 'Tracking number stored on the order',
      })
    } else {
      patch.execute([{unset: ['fulfillment.trackingNumber', 'trackingNumber']}])
      pushToast({
        status: 'warning',
        title: 'Tracking number cleared',
      })
    }
  }, [
    editableFields,
    order.fulfillment?.trackingNumber,
    order.trackingNumber,
    patch,
    pushToast,
    trackingDraft,
  ])

  const renderSection = (section: OrderViewSection) => {
    const sectionKey = section._key || section.title
    const visibleFields = section.fields.filter(
      (field) => !hiddenFields.has(field.fieldName as string),
    )
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
          <Inline space={2} style={{alignItems: 'center'}}>
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
        <Card padding={3} radius={2} tone="transparent" border>
          <Stack space={3}>
            {fieldsToShow.map((fieldName) => (
              <Flex
                key={fieldName}
                justify="space-between"
                align="flex-start"
                wrap="wrap"
                style={{gap: 12}}
              >
                <Text size={1} muted style={{minWidth: 140}}>
                  {formatAddressLabel(fieldName)}
                </Text>
                <Text size={2}>
                  {(value as ShippingAddress | undefined)?.[fieldName as keyof ShippingAddress] ||
                    '—'}
                </Text>
              </Flex>
            ))}
          </Stack>
        </Card>
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
      </FormField>
    )
  }

  const renderUrlField = (field: OrderViewField) => {
    const value = getFieldValue(field.fieldName as string) as string | undefined
    return (
      <FormField key={field.fieldName} title={field.label} description={getFieldDescription(field)}>
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
      </FormField>
    )
  }

  const renderStatusField = (field: OrderViewField) => (
    <EditableFieldWrapper
      key={field.fieldName}
      label={field.label}
      description={getFieldDescription(field)}
    >
      <Select
        value={statusDraft}
        onChange={(event) => handleStatusChange(event.currentTarget.value)}
      >
        <option value="">Select status</option>
        {ORDER_STATUS_OPTIONS.map((statusOption) => (
          <option key={statusOption} value={statusOption}>
            {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
          </option>
        ))}
      </Select>
    </EditableFieldWrapper>
  )

  const renderFulfillmentStatusField = (field: OrderViewField) => (
    <EditableFieldWrapper
      key={field.fieldName}
      label={field.label}
      description={getFieldDescription(field)}
    >
      <Select
        value={fulfillmentStatusDraft}
        onChange={(event) => handleFulfillmentStatusChange(event.currentTarget.value)}
      >
        <option value="">Select status</option>
        {FULFILLMENT_STATUS_OPTIONS.map((statusOption) => (
          <option key={statusOption} value={statusOption}>
            {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
          </option>
        ))}
      </Select>
    </EditableFieldWrapper>
  )

  const renderTrackingField = (field: OrderViewField) => (
    <Stack key={field.fieldName} space={3}>
      <EditableFieldWrapper label={field.label} description={getFieldDescription(field)}>
        <TextInput
          value={trackingDraft}
          onChange={(event) => setTrackingDraft(event.currentTarget.value)}
          onBlur={handleTrackingCommit}
          placeholder="Enter tracking number"
        />
      </EditableFieldWrapper>
      {(order.fulfillment?.trackingNumber || order.trackingNumber) && (
        <Inline space={3} style={{alignItems: 'center'}}>
          <CheckmarkCircleIcon style={{color: 'var(--card-fg-color)', fontSize: 16}} />
          <Card paddingX={3} paddingY={2} radius={2} tone="positive" border>
            <Text size={1}>Tracking saved</Text>
          </Card>
        </Inline>
      )}
    </Stack>
  )

  const renderDefaultField = (field: OrderViewField) => {
    const value = getFieldValue(field.fieldName as string)
    const title = field.label

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
        <TextInput value={displayValue} readOnly />
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
          <OrderItemsList items={order.cart} currency={order.currency} />
        </FormField>
      )
    }

    if (field.fieldName === 'shippingAddress') {
      return renderShippingAddress(field)
    }

    if (field.fieldName === 'status') {
      return renderStatusField(field)
    }

    if (field.fieldName === 'fulfillment.status') {
      return renderFulfillmentStatusField(field)
    }

    if (field.fieldName === 'fulfillment.trackingNumber') {
      return renderTrackingField(field)
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
        <Inline space={3} style={{alignItems: 'center'}}>
          <Spinner size={2} muted />
          <Text size={1}>Loading order view preferences…</Text>
        </Inline>
      )}
      {renderSummaryCards()}
      {config.sections.map((section) => renderSection(section))}
      <Card tone="transparent" padding={3}>
        <Inline space={3} style={{alignItems: 'center'}}>
          <TrolleyIcon />
          <Text size={1} muted>
            All fields except status and manual tracking are read-only to preserve Stripe syncs.
          </Text>
        </Inline>
      </Card>
    </Stack>
  )
}

export const orderView = OrderViewComponent
export default orderView
