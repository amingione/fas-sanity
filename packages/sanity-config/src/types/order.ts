import type {ReactNode} from 'react'

export const ORDER_VIEW_CONFIG_DOCUMENT_ID = '0c7693ee-7c3d-43ee-8d40-0e50a064a41b'

export type OrderStatus = 'paid' | 'fulfilled' | 'shipped' | 'cancelled' | 'refunded'

export type SanityReference = {
  _type: 'reference'
  _ref: string
}

export interface OrderCartItem {
  _key?: string
  name?: string
  productName?: string
  sku?: string
  quantity?: number
  price?: number
  total?: number
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  upgradesTotal?: number | null
  productRef?: SanityReference | null
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
  discountLabel?: string | null
  discountPercent?: number | null
  amountShipping?: number | null
  paymentStatus?: string
  paymentIntentId?: string
  stripeSessionId?: string
  cardBrand?: string
  cardLast4?: string
  receiptUrl?: string
  invoiceRef?: SanityReference | null
  customerName?: string
  customerEmail?: string
  customerRef?: SanityReference | null
  cart?: OrderCartItem[] | null
  currency?: string
  manualTrackingNumber?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  shippingLabelUrl?: string | null
  packingSlipUrl?: string | null
  shippingAddress?: ShippingAddress
  fulfillment?: Record<string, any> | null
  fulfillmentWorkflow?: {currentStage?: string | null; [key: string]: any} | null
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
