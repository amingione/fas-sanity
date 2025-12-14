import type {ReactNode} from 'react'

export const ORDER_VIEW_CONFIG_DOCUMENT_ID = '0c7693ee-7c3d-43ee-8d40-0e50a064a41b'

export type OrderStatus =
  | 'paid'
  | 'fulfilled'
  | 'shipped'
  | 'delivered'
  | 'canceled'
  | 'cancelled'
  | 'refunded'

export type SanityReference = {
  _type: 'reference'
  _ref: string
}

export interface FileAsset {
  _type?: 'file'
  asset?: SanityReference | null
}

export interface OrderAddress {
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

export interface ShipmentWeight {
  value?: number
  unit?: string
}

export interface PackageDimensions {
  length?: number
  width?: number
  height?: number
  weight?: number
  weightUnit?: string
  dimensionUnit?: string
}

export interface OrderCartItem {
  _key?: string
  name?: string
  productName?: string
  sku?: string
  quantity?: number
  price?: number | null
  total?: number | null
  lineTotal?: number | null
  selectedVariant?: string | null
  addOns?: string[]
  optionDetails?: string[]
  optionSummary?: string | null
  upgrades?: string[]
  upgradesTotal?: number | null
  image?: string
  productUrl?: string
  productRef?: SanityReference | null
  productSlug?: string | null
  metadata?: Record<string, unknown> | null
  metadataEntries?: Array<{key?: string | null; value?: string | null}> | null
}

export interface ShippingAddress {
  name?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
}

export interface OrderDocument {
  _id?: string
  _type?: 'order'
  orderNumber?: string
  orderType?: string
  status?: OrderStatus
  createdAt?: string
  fulfilledAt?: string
  totalAmount?: number | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountDiscount?: number | null
  amountShipping?: number | null
  paymentStatus?: string
  paymentIntentId?: string
  chargeId?: string | null
  stripeSessionId?: string
  cardBrand?: string
  cardLast4?: string
  receiptUrl?: string
  invoiceData?: {
    invoiceNumber?: string | null
    invoiceId?: string | null
    invoiceUrl?: string | null
    pdfUrl?: string | null
  } | null
  invoiceRef?: SanityReference | null
  amountRefunded?: number | null
  lastRefundId?: string | null
  lastRefundReason?: string | null
  lastRefundStatus?: string | null
  lastRefundedAt?: string | null
  customerName?: string
  customerEmail?: string
  customerRef?: SanityReference | null
  cart?: OrderCartItem[] | null
  currency?: string
  manualTrackingNumber?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  service?: string | null
  deliveryDays?: number | null
  estimatedDeliveryDate?: string | null
  easypostRateId?: string | null
  easyPostShipmentId?: string | null
  easyPostTrackerId?: string | null
  labelCreatedAt?: string | null
  labelCost?: number | null
  labelPurchased?: boolean | null
  labelPurchasedAt?: string | null
  labelPurchasedBy?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  shippingLabelFile?: FileAsset | null
  shippingLabelUrl?: string | null
  packingSlipUrl?: string | null
  shippingLog?: Array<{
    _key?: string
    status?: string | null
    message?: string | null
    trackingNumber?: string | null
    trackingUrl?: string | null
    labelUrl?: string | null
    weight?: number | null
    createdAt?: string | null
  }> | null
  shippingStatus?: {
    status?: string | null
    carrier?: string | null
    service?: string | null
    trackingCode?: string | null
    trackingUrl?: string | null
    labelUrl?: string | null
    cost?: number | null
    currency?: string | null
    lastEventAt?: string | null
  } | null
  orderEvents?: Array<{
    _key?: string
    type?: string | null
    status?: string | null
    label?: string | null
    message?: string | null
    amount?: number | null
    currency?: string | null
    stripeEventId?: string | null
    metadata?: string | null
    createdAt?: string | null
  }> | null
  attribution?: {
    sessionId?: string | null
    landingPage?: string | null
    referrer?: string | null
    device?: string | null
    browser?: string | null
    os?: string | null
    capturedAt?: string | null
  } | null
  dimensions?: PackageDimensions | null
  weight?: ShipmentWeight | null
  shippingAddress?: OrderAddress
  billingAddress?: OrderAddress
  packageDimensions?: PackageDimensions | null
  fulfillmentDetails?: {
    status?: string | null
    shippingAddress?: string | null
    packageWeight?: number | null
    packageDimensions?: string | null
    trackingNumber?: string | null
    trackingDetails?: string | null
    fulfillmentNotes?: string | null
  } | null
  fulfillment?: {
    status?: string | null
    fulfillmentNotes?: string | null
    processedBy?: string | null
    processedAt?: string | null
  } | null
  fulfillmentWorkflow?:
    | {
        currentStage?: string | null
        stages?: Array<{
          _key?: string
          stage?: string | null
          timestamp?: string | null
          completedBy?: string | null
          notes?: string | null
        }>
      }
    | null
  stripeLastSyncedAt?: string | null
  stripePaymentIntentStatus?: string | null
  stripeSource?: string | null
  webhookNotified?: boolean | null
  confirmationEmailSent?: boolean | null
}

export type OrderViewFieldType =
  | 'string'
  | 'number'
  | 'datetime'
  | 'array'
  | 'object'
  | 'reference'
  | 'url'

export interface OrderViewField {
  _key?: string
  fieldName: keyof OrderDocument | string
  label: string
  type?: OrderViewFieldType
  readOnly?: boolean
  editable?: boolean
  note?: string
  hidden?: boolean
  prominent?: boolean
  options?: string[]
  displayFields?: string[]
}

export interface OrderViewSection {
  _key?: string
  title: string
  collapsed?: boolean
  fields: OrderViewField[]
}

export interface OrderViewSettings {
  defaultCollapsedSections?: string[]
  hideComplexMetadata?: boolean
  preserveStripeSync?: boolean
  prominentFields?: string[]
}

export interface OrderViewConfig {
  editableFields?: string[]
  hiddenFields?: string[]
  protectedFields?: string[]
  sections: OrderViewSection[]
  viewSettings?: OrderViewSettings
}

export type IconComponent = (props: {className?: string}) => ReactNode
