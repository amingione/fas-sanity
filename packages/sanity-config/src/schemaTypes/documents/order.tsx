// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
// src/schemaTypes/documents/order.tsx
import {defineField, defineType} from 'sanity'
import {
  PackageIcon,
  DocumentPdfIcon,
  ResetIcon,
  CheckmarkCircleIcon,
  CopyIcon,
  TrashIcon,
  EnvelopeIcon,
} from '@sanity/icons'
import type {DocumentActionsResolver} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'
import {formatOrderNumber} from '../../utils/orderNumber'
import OrderNumberInput from '../../components/inputs/OrderNumberInput'
import {getNetlifyFunctionBaseCandidates} from '../../utils/netlifyBase'
import ComputedOrderCustomerNameInput from '../../components/inputs/ComputedOrderCustomerNameInput'
import FulfillmentOverview from '../../components/FulfillmentOverview'

const SANITY_API_VERSION = '2024-10-01'

const deriveOrderType = async (
  document: any,
  getClient?: (options?: {apiVersion?: string}) => any,
): Promise<'online' | 'in-store' | 'wholesale'> => {
  if (document?.invoiceRef?._ref) return 'in-store'
  if (document?.wholesaleDetails || document?.wholesaleWorkflowStatus) return 'wholesale'
  if (document?.orderType === 'wholesale') return 'wholesale'
  if (document?.stripeSessionId) return 'online'

  const customerRef = document?.customerRef?._ref
  if (customerRef && typeof getClient === 'function') {
    try {
      const client = getClient({apiVersion: SANITY_API_VERSION})
      const customer = await client.fetch(
        `*[_type == "customer" && _id == $id][0]{roles, customerType}`,
        {id: customerRef},
      )
      const roles = Array.isArray(customer?.roles) ? customer?.roles : []
      const customerType = (customer?.customerType || '').toString().toLowerCase()
      if (roles.includes('wholesale') || roles.includes('vendor')) return 'wholesale'
      if (customerType === 'vendor' || customerType === 'wholesale') return 'wholesale'
    } catch {
      // fall back to default
    }
  }

  return 'online'
}

// ============================================================================
// ORDER SCHEMA
// ============================================================================

const orderSchema = defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  icon: PackageIcon,
  initialValue: async (_, context) => {
    const baseDoc = (context as any)?.document || {}
    const orderType = await deriveOrderType(baseDoc, (context as any)?.getClient)
    const workflowDefaults =
      orderType === 'wholesale'
        ? {
            wholesaleWorkflowStatus: 'pending',
          }
        : {}
    return {
      orderType,
      currency: 'USD',
      ...workflowDefaults,
    }
  },
  groups: [
    {name: 'basics', title: 'Order Basics'},
    {name: 'customer', title: 'Customer'},
    {name: 'items', title: 'Items', default: true},
    {name: 'totals', title: 'Totals'},
    {name: 'payment', title: 'Payment'},
    {name: 'fulfillment', title: 'Fulfillment'},
  ],
  fields: [
    defineField({
      name: 'fulfillmentOverview',
      type: 'object',
      title: 'Fulfillment Overview',
      group: 'basics',
      components: {
        input: FulfillmentOverview,
      },
      fields: [{name: 'placeholder', type: 'string', hidden: true}],
      hidden: ({document}) => !document,
    }),
    defineField({
      name: 'orderNumber',
      type: 'string',
      title: 'Order Number',
      group: 'basics',
      readOnly: false,
      components: {input: OrderNumberInput},
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      title: 'Order Slug',
      description: 'URL-friendly identifier',
      group: 'basics',
      options: {
        source: 'orderNumber',
        maxLength: 96,
      },
      hidden: true,
    }),
    defineField({
      name: 'orderType',
      type: 'string',
      title: 'Order Type',
      description: 'Computed automatically for internal filtering',
      group: 'basics',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'status',
      type: 'string',
      title: 'Order Status',
      group: 'basics',
      options: {
        list: [
          {title: 'Paid', value: 'paid'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Shipped', value: 'shipped'},
          {title: 'Cancelled', value: 'cancelled'},
          {title: 'Refunded', value: 'refunded'},
        ],
        layout: 'dropdown',
      },
    }),
    defineField({
      name: 'wholesaleWorkflowStatus',
      title: 'Wholesale Workflow Status',
      type: 'string',
      description: 'Internal workflow for wholesale orders',
      group: 'basics',
      hidden: ({document}) => document?.orderType !== 'wholesale',
      options: {
        list: [
          {title: 'Pending Review', value: 'pending'},
          {title: 'Approved - Awaiting Payment', value: 'approved'},
          {title: 'Paid - Ready to Fulfill', value: 'paid'},
          {title: 'Partially Fulfilled', value: 'partial'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
        layout: 'dropdown',
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'wholesaleDetails',
      title: 'Wholesale Details',
      type: 'object',
      hidden: ({document}) => document?.orderType !== 'wholesale',
      group: 'basics',
      options: {collapsible: true, collapsed: false},
      fields: [
        {
          name: 'vendor',
          title: 'Vendor',
          type: 'reference',
          to: [{type: 'vendor'}],
        },
        {
          name: 'vendorId',
          title: 'Vendor ID',
          type: 'string',
          description: 'External vendor ID (optional)',
        },
        {
          name: 'vendorName',
          title: 'Vendor Name',
          type: 'string',
        },
        {
          name: 'pricingTier',
          title: 'Pricing Tier',
          type: 'string',
          options: {
            list: [
              {title: 'Standard', value: 'standard'},
              {title: 'Preferred', value: 'preferred'},
              {title: 'Platinum', value: 'platinum'},
            ],
          },
        },
        {
          name: 'poNumber',
          title: 'PO Number',
          type: 'string',
        },
        {
          name: 'bulkQuantity',
          title: 'Bulk Quantity',
          type: 'number',
          validation: (Rule) => Rule.min(1),
        },
        {
          name: 'expectedShipDate',
          title: 'Expected Ship Date',
          type: 'date',
        },
        {
          name: 'paymentTerms',
          title: 'Payment Terms',
          type: 'string',
          options: {
            list: [
              {title: 'Immediate Payment', value: 'immediate'},
              {title: 'Net 30', value: 'net30'},
              {title: 'Net 60', value: 'net60'},
              {title: 'Net 90', value: 'net90'},
              {title: 'Upon Receipt', value: 'upon_receipt'},
              // legacy values kept for backwards compatibility
              {title: 'Net 30 (legacy)', value: 'net_30'},
              {title: 'Net 60 (legacy)', value: 'net_60'},
              {title: 'Due on Receipt (legacy)', value: 'due_on_receipt'},
            ],
          },
          initialValue: 'immediate',
        },
        {
          name: 'bulkUnitPrice',
          title: 'Bulk Unit Price',
          type: 'number',
          validation: (Rule) => Rule.min(0),
        },
        {
          name: 'workflowStatus',
          title: 'Workflow Status',
          type: 'string',
          options: {
            list: [
              {title: 'Pending Review', value: 'pending'},
              {title: 'Approved - Awaiting Payment', value: 'approved'},
              {title: 'Paid - Ready to Fulfill', value: 'paid'},
              {title: 'Partially Fulfilled', value: 'partial'},
              {title: 'Fulfilled', value: 'fulfilled'},
              {title: 'Cancelled', value: 'cancelled'},
            ],
          },
          initialValue: 'pending',
        },
        {
          name: 'paymentLinkId',
          title: 'Payment Link ID',
          type: 'string',
          description: 'Stripe payment link for this order',
        },
        {
          name: 'approvedAt',
          title: 'Approved At',
          type: 'datetime',
        },
        {
          name: 'approvedBy',
          title: 'Approved By',
          type: 'string',
        },
        {
          name: 'paidAt',
          title: 'Paid At',
          type: 'datetime',
        },
        {
          name: 'dueDate',
          title: 'Payment Due Date',
          type: 'date',
          description: 'For net terms orders',
        },
        {
          name: 'partialFulfillment',
          title: 'Partial Fulfillment',
          type: 'object',
          fields: [
            {
              name: 'enabled',
              title: 'Split Order',
              type: 'boolean',
            },
            {
              name: 'fulfilledItems',
              title: 'Fulfilled Items',
              type: 'array',
              of: [{type: 'string'}],
              description: 'SKUs of items already shipped',
            },
            {
              name: 'pendingItems',
              title: 'Pending Items',
              type: 'array',
              of: [{type: 'string'}],
              description: 'SKUs of items still waiting (preorder/backorder)',
            },
            {
              name: 'notes',
              title: 'Partial Fulfillment Notes',
              type: 'text',
            },
          ],
        },
        {
          name: 'notes',
          title: 'Wholesale Notes',
          type: 'text',
          rows: 3,
        },
      ],
    }),
    defineField({
      name: 'inStoreDetails',
      title: 'In-Store Details',
      type: 'object',
      hidden: ({document}) => document?.orderType !== 'in-store',
      group: 'basics',
      options: {collapsible: true, collapsed: false},
      fields: [
        {
          name: 'appointment',
          title: 'Appointment',
          type: 'reference',
          to: [{type: 'appointment'}],
        },
        {
          name: 'workOrder',
          title: 'Work Order',
          type: 'reference',
          to: [{type: 'workOrder'}],
        },
        {
          name: 'bay',
          title: 'Service Bay',
          type: 'string',
          options: {
            list: [
              {title: 'Bay 1', value: 'bay1'},
              {title: 'Bay 2', value: 'bay2'},
              {title: 'Bay 3', value: 'bay3'},
              {title: 'Bay 4', value: 'bay4'},
            ],
          },
        },
        {
          name: 'technician',
          title: 'Technician',
          type: 'string',
        },
      ],
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Order Date',
      group: 'basics',
      readOnly: false,
    }),

    // Customer
    defineField({
      name: 'customerName',
      type: 'string',
      title: 'Customer Name',
      group: 'customer',
      readOnly: false,
      description: 'Computed from customer record or shipping address; updates automatically.',
      components: {input: ComputedOrderCustomerNameInput as any},
    }),
    defineField({
      name: 'customerEmail',
      type: 'string',
      title: 'Customer Email',
      group: 'customer',
      readOnly: false,
    }),
    defineField({
      name: 'customerRef',
      type: 'reference',
      title: 'Customer Reference',
      to: [{type: 'customer'}, {type: 'vendor'}],
      group: 'customer',
      readOnly: false,
      hidden: true,
    }),

    // Items
    defineField({
      name: 'cart',
      type: 'array',
      title: 'Order Items',
      group: 'items',
      readOnly: false,
      of: [{type: 'orderCartItem'}],
    }),

    // Totals
    defineField({
      name: 'amountSubtotal',
      type: 'number',
      title: 'Subtotal',
      group: 'totals',
      readOnly: false,
    }),
    defineField({
      name: 'amountTax',
      type: 'number',
      title: 'Tax',
      group: 'totals',
      readOnly: false,
    }),
    defineField({
      name: 'amountShipping',
      type: 'number',
      title: 'Shipping',
      group: 'totals',
      readOnly: false,
    }),
    defineField({
      name: 'totalAmount',
      type: 'number',
      title: 'Total Amount',
      group: 'totals',
      readOnly: false,
    }),
    defineField({
      name: 'amountDiscount',
      type: 'number',
      title: 'Discounts',
      group: 'totals',
      readOnly: false,
      hidden: true,
    }),

    // Payment
    defineField({
      name: 'paymentStatus',
      type: 'string',
      title: 'Payment Status',
      group: 'payment',
      readOnly: false,
    }),
    defineField({
      name: 'cardBrand',
      type: 'string',
      title: 'Card Brand',
      group: 'payment',
      readOnly: false,
    }),
    defineField({
      name: 'cardLast4',
      type: 'string',
      title: 'Card Last 4',
      group: 'payment',
      readOnly: false,
    }),
    defineField({
      name: 'receiptUrl',
      type: 'url',
      title: 'Receipt URL',
      group: 'payment',
      readOnly: false,
    }),
    defineField({
      name: 'paymentIntentId',
      type: 'string',
      title: 'Payment Intent ID',
      group: 'payment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'stripeSessionId',
      type: 'string',
      title: 'Stripe Session ID',
      group: 'payment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'currency',
      type: 'string',
      title: 'Currency',
      group: 'payment',
      readOnly: false,
      hidden: true,
      initialValue: 'USD',
    }),
    defineField({
      name: 'invoiceRef',
      type: 'reference',
      title: 'Invoice',
      to: [{type: 'invoice'}],
      group: 'payment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'stripeSummary',
      type: 'stripeOrderSummary',
      title: 'Stripe Summary',
      description: 'Stripe checkout/payment snapshot',
      group: 'payment',
      readOnly: false,
      options: {collapsible: true, collapsed: true},
    }),

    // Fulfillment
    defineField({
      name: 'fulfillment',
      type: 'object',
      title: 'Fulfillment',
      description: 'Tracking and delivery status',
      group: 'fulfillment',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        {
          name: 'status',
          type: 'string',
          title: 'Fulfillment Status',
          options: {
            list: [
              {title: 'Unfulfilled', value: 'unfulfilled'},
              {title: 'Shipped', value: 'shipped'},
              {title: 'Delivered', value: 'delivered'},
            ],
            layout: 'dropdown',
          },
          initialValue: 'unfulfilled',
        },
        {
          name: 'shippingAddress',
          type: 'shippingAddress',
          title: 'Shipping Address',
          options: {collapsible: true, collapsed: false},
        },
        {
          name: 'packageDimensions',
          type: 'object',
          title: 'Package Dimensions & Weight',
          options: {collapsible: true, collapsed: true},
          fields: [
            {
              name: 'weightDisplay',
              type: 'string',
              title: 'Weight',
              readOnly: false,
              description: 'Auto-filled from Stripe or product data (e.g., 8 lb)',
            },
            {
              name: 'dimensionsDisplay',
              type: 'string',
              title: 'Dimensions',
              readOnly: false,
              description: 'Auto-filled from product data (e.g., 10 x 8 x 2 in)',
            },
            {name: 'length', type: 'number', title: 'Length (inches)'},
            {name: 'width', type: 'number', title: 'Width (inches)'},
            {name: 'height', type: 'number', title: 'Height (inches)'},
            {name: 'weight', type: 'number', title: 'Weight'},
            {
              name: 'weightUnit',
              type: 'string',
              title: 'Weight Unit',
              options: {
                list: [
                  {title: 'Pounds (lbs)', value: 'lbs'},
                  {title: 'Ounces (oz)', value: 'oz'},
                  {title: 'Kilograms (kg)', value: 'kg'},
                ],
              },
              hidden: true,
            },
            {
              name: 'dimensionUnit',
              type: 'string',
              title: 'Dimension Unit',
              options: {
                list: [
                  {title: 'Inches (in)', value: 'in'},
                  {title: 'Centimeters (cm)', value: 'cm'},
                ],
              },
              hidden: true,
            },
          ],
        },
        {
          name: 'easypostRateId',
          type: 'string',
          title: 'EasyPost Rate ID',
          description: 'Selected shipping rate ID from EasyPost/Stripe',
          readOnly: false,
        },
        {
          name: 'service',
          type: 'string',
          title: 'Shipping Service',
          description: 'Service level (e.g., Priority, Ground)',
          readOnly: false,
        },
        {
          name: 'trackingNumber',
          type: 'string',
          title: 'Tracking Number',
        },
        {
          name: 'trackingUrl',
          type: 'url',
          title: 'Tracking URL',
        },
        {
          name: 'carrier',
          type: 'string',
          title: 'Carrier',
          options: {
            list: ['USPS', 'UPS', 'FedEx', 'Other'],
          },
        },
        {
          name: 'shippedAt',
          type: 'datetime',
          title: 'Shipped Date',
        },
        {
          name: 'deliveredAt',
          type: 'datetime',
          title: 'Delivered Date',
        },
        {
          name: 'fulfillmentNotes',
          type: 'text',
          title: 'Fulfillment Notes',
          description: 'Internal notes about packing, shipping issues, etc.',
          rows: 3,
        },
      ],
    }),
    defineField({
      name: 'shippingAddress',
      type: 'shippingAddress',
      title: 'Shipping Address',
      group: 'fulfillment',
      hidden: undefined,
      options: {
        collapsible: true,
        collapsed: false,
      },
    }),
    defineField({
      name: 'billingAddress',
      type: 'object',
      title: 'Billing Address',
      group: 'customer',
      options: {
        collapsible: true,
        collapsed: true,
      },
      fields: [
        {name: 'name', type: 'string', title: 'Billing Name'},
        {name: 'phone', type: 'string', title: 'Phone'},
        {name: 'email', type: 'string', title: 'Email'},
        {name: 'addressLine1', type: 'string', title: 'Address Line 1'},
        {name: 'addressLine2', type: 'string', title: 'Address Line 2'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State / Province'},
        {name: 'postalCode', type: 'string', title: 'Postal Code'},
        {name: 'country', type: 'string', title: 'Country'},
      ],
    }),
    defineField({
      name: 'manualTrackingNumber',
      type: 'string',
      title: 'Tracking Number (Manual Entry)',
      description: 'Legacy field for quick entry',
      group: 'fulfillment',
      hidden: true,
    }),
    defineField({
      name: 'trackingNumber',
      type: 'string',
      title: 'Tracking Number (Auto)',
      group: 'fulfillment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'trackingUrl',
      type: 'url',
      title: 'Tracking URL',
      group: 'fulfillment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'easyPostShipmentId',
      type: 'string',
      title: 'EasyPost Shipment ID',
      group: 'fulfillment',
      hidden: true,
      readOnly: false,
    }),
    defineField({
      name: 'easyPostTrackerId',
      type: 'string',
      title: 'EasyPost Tracker ID',
      group: 'fulfillment',
      hidden: true,
      readOnly: false,
    }),
    defineField({
      name: 'shippingLabelUrl',
      type: 'url',
      title: 'Shipping Label',
      group: 'fulfillment',
      readOnly: false,
    }),
    defineField({
      name: 'labelCreatedAt',
      type: 'datetime',
      title: 'Label Created At',
      group: 'fulfillment',
      readOnly: false,
    }),
    defineField({
      name: 'labelCost',
      type: 'number',
      title: 'Label Cost',
      description: 'Cost charged for the label',
      group: 'fulfillment',
      readOnly: false,
    }),
    defineField({
      name: 'labelPurchasedFrom',
      type: 'string',
      title: 'Label Purchased From',
      description: 'Carrier or provider used to buy the label',
      group: 'fulfillment',
      readOnly: false,
    }),
    defineField({
      name: 'packingSlipUrl',
      type: 'url',
      title: 'Packing Slip',
      group: 'fulfillment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'fulfilledAt',
      type: 'datetime',
      title: 'Fulfilled Date',
      group: 'fulfillment',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'shippingMetadata',
      type: 'object',
      title: 'Shipping Metadata',
      description: 'Raw shipping data from Stripe',
      group: 'fulfillment',
      options: {
        collapsible: true,
        collapsed: true,
      },
      readOnly: false,
      hidden: true,
      fields: [
        {
          name: 'raw',
          type: 'text',
          title: 'Raw Metadata (JSON)',
          description: 'Unparsed metadata payload from Stripe',
          rows: 6,
          readOnly: false,
        },
      ],
    }),
  ],
  preview: {
    select: {
      orderNumber: 'orderNumber',
      customerName: 'customerName',
      shippingName: 'shippingAddress.name',
      status: 'status',
      total: 'totalAmount',
    },
    prepare({orderNumber, customerName, shippingName, status, total}) {
      const displayOrderNumber = formatOrderNumber(orderNumber) || orderNumber
      const formattedTotal = total
        ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(total)
        : '$0.00'
      const displayName = customerName || shippingName || 'No customer'

      return {
        title: displayOrderNumber || 'Untitled Order',
        subtitle: `${displayName} • ${status || 'unknown'} • ${formattedTotal}`,
      }
    },
  },
})

export default orderSchema

type NetlifyRequestInit = RequestInit & {json?: unknown}

const normalizeDocumentId = (value?: string | null): string => {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/^drafts\./, '')
}

const resolvePatchTargets = (rawId?: string | null): string[] => {
  if (!rawId) return []
  const clean = String(rawId).trim()
  if (!clean) return []
  const published = clean.replace(/^drafts\./, '')
  const ids = new Set<string>([clean])
  if (published && published !== clean) {
    ids.add(published)
  }
  return Array.from(ids)
}

const openExternalUrl = (url?: string | null) => {
  if (!url || typeof window === 'undefined') return
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    window.location.href = url
  }
}

const confirmAction = (message: string) => {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm(message)
}

const filenameSafe = (value?: string | null, fallback = 'order') => {
  const base = (value ?? fallback ?? 'order').toString().trim()
  const normalized = base
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || fallback || 'order'
}

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const readResponseMessage = async (response: Response) => {
  try {
    const data = await response.clone().json()
    if (data && typeof data === 'object') {
      if (typeof (data as any).error === 'string') return (data as any).error
      if (typeof (data as any).message === 'string') return (data as any).message
    }
  } catch {
    // fall through to text parsing
  }

  try {
    const text = await response.text()
    if (text) return text
  } catch {
    // ignore
  }

  return `Request failed (HTTP ${response.status})`
}

const responseToPdfBlob = async (response: Response): Promise<Blob> => {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/pdf')) {
    const buffer = await response.arrayBuffer()
    return new Blob([buffer], {type: 'application/pdf'})
  }
  const base64 = (await response.text()).replace(/^"|"$/g, '')
  const buffer = decodeBase64ToArrayBuffer(base64)
  return new Blob([buffer], {type: 'application/pdf'})
}

const parseCurrencyAmount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const callNetlifyFunction = async (
  fnName: string,
  init: NetlifyRequestInit = {},
): Promise<Response> => {
  const {json, ...rest} = init
  const body =
    rest.body !== undefined ? rest.body : json !== undefined ? JSON.stringify(json) : undefined

  const baseHeaders = new Headers(rest.headers || undefined)
  if (body && !baseHeaders.has('Content-Type') && typeof body === 'string') {
    baseHeaders.set('Content-Type', 'application/json')
  }

  const bases = getNetlifyFunctionBaseCandidates()
  let lastError: unknown = null

  for (const base of bases) {
    const url = `${base}/.netlify/functions/${fnName}`
    try {
      const response = await fetch(url, {
        ...rest,
        method: rest.method ?? 'POST',
        headers: new Headers(baseHeaders),
        body,
      })

      if (response.status === 404) {
        lastError = new Error(`${fnName} not available at ${base}`)
        continue
      }

      if (response.ok && typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem('NLFY_BASE', base)
        } catch {
          // ignore storage failures
        }
      }

      return response
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('Unable to reach Netlify functions')
}

// ============================================================================
// DOCUMENT ACTIONS
// ============================================================================

export const orderActions: DocumentActionsResolver = (prev, context) => {
  const {schemaType} = context

  if (schemaType !== 'order') {
    return prev
  }

  const getStateFlags = (doc: any) => {
    if (!doc || typeof doc !== 'object') {
      return {tracking: undefined, labelUrl: undefined, isFulfilled: false}
    }
    const tracking =
      asOptionalString(doc.trackingNumber) || asOptionalString(doc.manualTrackingNumber)
    const labelUrl = asOptionalString(doc.shippingLabelUrl)
    const fulfillmentStatus = asOptionalString(doc?.fulfillment?.status)?.toLowerCase()
    const isFulfilled =
      fulfillmentStatus === 'fulfilled' ||
      fulfillmentStatus === 'shipped' ||
      doc?.status === 'fulfilled' ||
      doc?.status === 'shipped'
    return {tracking, labelUrl, isFulfilled}
  }

  return [
    ...prev,

    // Message vendor (creates vendorMessage linked to order)
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      const anyDoc = doc as any
      if (!anyDoc || anyDoc.orderType !== 'wholesale') return null

      const vendorRef = anyDoc.wholesaleDetails?.vendor?._ref || anyDoc.customerRef?._ref
      const orderId = normalizeDocumentId(anyDoc?._id || id)
      const subject = `Regarding Order ${anyDoc.orderNumber || orderId || 'wholesale'}`

      return {
        name: 'messageVendor',
        label: 'Message Vendor',
        icon: EnvelopeIcon,
        tone: 'primary',
        disabled: !vendorRef || !orderId,
        title: vendorRef ? undefined : 'Add a vendor to this order first',
        onHandle: async () => {
          if (!vendorRef || !orderId) {
            props.onComplete()
            return
          }

          try {
            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            const message = await client.create(
              {
                _type: 'vendorMessage',
                vendor: {_type: 'reference', _ref: vendorRef},
                subject,
                status: 'open',
                priority: 'normal',
                category: 'order',
                relatedOrder: {_type: 'reference', _ref: orderId},
              },
              {autoGenerateArrayKeys: true},
            )

            if (typeof window !== 'undefined' && message?._id) {
              window.location.hash = `#/desk/vendorMessage;${message._id}`
            }
          } catch (error) {
            console.error('messageVendor failed', error)
            alert('Unable to create vendor message.')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Approve wholesale order (generate payment link or set terms)
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      const anyDoc = doc as any
      if (!anyDoc || anyDoc.orderType !== 'wholesale') return null

      const workflow =
        anyDoc.wholesaleDetails?.workflowStatus || anyDoc.wholesaleWorkflowStatus || 'pending'

      return {
        name: 'approveWholesaleOrder',
        label: 'Approve Order',
        icon: CheckmarkCircleIcon,
        tone: 'positive',
        disabled: workflow !== 'pending',
        onHandle: async () => {
          if (!anyDoc) {
            alert('Document not found.')
            props.onComplete()
            return
          }
          const orderId = normalizeDocumentId(anyDoc?._id || id)
          if (!orderId) {
            alert('Publish the order before approving.')
            props.onComplete()
            return
          }

          try {
            const response = await callNetlifyFunction('create-wholesale-payment-link', {
              json: {orderId},
            })
            const payload = await response
              .clone()
              .json()
              .catch(() => null as any)

            if (!response.ok || !payload?.success) {
              const message =
                (payload && (payload.error || payload.message)) ||
                (await readResponseMessage(response))
              throw new Error(message || 'Unable to approve order.')
            }

            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            const patch = client.patch(orderId).set({
              wholesaleWorkflowStatus: payload.workflowStatus || 'approved',
              'wholesaleDetails.workflowStatus': payload.workflowStatus || 'approved',
              'wholesaleDetails.approvedAt': new Date().toISOString(),
            })

            if (payload.paymentLinkId) {
              patch.set({'wholesaleDetails.paymentLinkId': payload.paymentLinkId})
            }
            if (payload.paymentLinkUrl) {
              patch.set({'wholesaleDetails.paymentLinkUrl': payload.paymentLinkUrl})
            }
            if (payload.dueDate) {
              patch.set({'wholesaleDetails.dueDate': payload.dueDate})
            }

            await patch.commit({autoGenerateArrayKeys: true})
            alert(
              payload.paymentLinkUrl
                ? 'Order approved and payment link generated.'
                : 'Order approved.',
            )
          } catch (error) {
            console.error('approveWholesaleOrder failed', error)
            alert((error as Error)?.message || 'Unable to approve order.')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Fulfill Order (calls Netlify function)
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      const stateFlags = getStateFlags(doc)
      if (!doc) return null

      return {
        name: 'fulfillOrder',
        label: 'Fulfill Order',
        icon: CheckmarkCircleIcon,
        tone: 'positive',
        disabled: stateFlags.isFulfilled,
        onHandle: async () => {
          if (!doc) {
            props.onComplete()
            return
          }
          try {
            const orderId = normalizeDocumentId(doc._id || id)
            if (!orderId) {
              alert('Publish the order before fulfilling.')
              props.onComplete()
              return
            }
            await callNetlifyFunction('fulfill-order', {json: {orderId, markOnly: true}})
            alert('Order marked as fulfilled.')
          } catch (error) {
            console.error('Fulfill order failed', error)
            alert('Unable to fulfill order.')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Duplicate Order
    (props) => {
      const {draft, published} = props
      const source = draft || published
      if (!source) return null

      return {
        name: 'duplicateOrder',
        label: 'Duplicate Order',
        icon: CopyIcon,
        onHandle: async () => {
          try {
            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            const {
              _id,
              _rev,
              _updatedAt,
              _createdAt,
              _type,
              _seqNo,
              _version,
              orderNumber,
              ...rest
            } = source as any
            const payload: {_type: 'order'} & Record<string, any> = {
              ...rest,
              _type: 'order',
              orderNumber: orderNumber ? `${orderNumber}-copy` : undefined,
              status: rest?.status || 'draft',
            }
            await client.create(payload, {autoGenerateArrayKeys: true})
            alert('Order duplicated.')
          } catch (error) {
            console.error('Duplicate order failed', error)
            alert('Unable to duplicate order.')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Delete Order (draft + published)
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      if (!doc) return null

      return {
        name: 'deleteOrder',
        label: 'Delete Order',
        icon: TrashIcon,
        tone: 'critical',
        onHandle: async () => {
          const confirmDelete = window.confirm('Delete this order? This cannot be undone.')
          if (!confirmDelete) {
            props.onComplete()
            return
          }
          try {
            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            const targets = resolvePatchTargets(id)
            const tx = client.transaction()
            targets.forEach((targetId) => tx.delete(targetId))
            await tx.commit({autoGenerateArrayKeys: true})
            alert('Order deleted.')
          } catch (error) {
            console.error('Delete order failed', error)
            alert('Unable to delete order.')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Print Packing Slip
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        name: 'printPackingSlip',
        label: 'Print Packing Slip',
        icon: DocumentPdfIcon,
        tone: 'primary',
        disabled: !doc,
        onHandle: async () => {
          if (!doc) return

          const savedUrl = typeof doc.packingSlipUrl === 'string' ? doc.packingSlipUrl.trim() : ''
          if (savedUrl) {
            openExternalUrl(savedUrl)
            props.onComplete()
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          const invoiceId = normalizeDocumentId(
            (doc?.invoiceRef as {_ref?: string} | undefined)?._ref,
          )
          const orderNumberValue = asOptionalString(doc?.orderNumber)
          if (!orderId && !invoiceId) {
            alert('Publish the order or link an invoice before generating a packing slip.')
            props.onComplete()
            return
          }

          const payload: Record<string, string> = {}
          if (orderId) payload.orderId = orderId
          if (invoiceId) payload.invoiceId = invoiceId
          const patchTargets = resolvePatchTargets(id)

          try {
            const response = await callNetlifyFunction('generatePackingSlips', {
              json: payload,
            })

            if (!response.ok) {
              const message = await readResponseMessage(response)
              throw new Error(message)
            }

            const pdfBlob = await responseToPdfBlob(response)
            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            let targetUrl: string | null = null

            try {
              const asset = await client.assets.upload('file', pdfBlob, {
                filename: `packing-slip-${filenameSafe(orderNumberValue || 'order')}.pdf`,
                contentType: 'application/pdf',
              })
              if ((asset as any)?.url) {
                targetUrl = (asset as any).url
                for (const targetId of patchTargets) {
                  try {
                    await client
                      .patch(targetId)
                      .set({packingSlipUrl: targetUrl})
                      .commit({autoGenerateArrayKeys: true})
                  } catch (patchErr: any) {
                    if (patchErr?.statusCode !== 404) {
                      throw patchErr
                    }
                  }
                }
              }
            } catch (uploadErr) {
              console.warn('Packing slip upload failed', uploadErr)
            }

            if (!targetUrl) {
              const objectUrl = URL.createObjectURL(pdfBlob)
              targetUrl = objectUrl
              setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
            }

            openExternalUrl(targetUrl)
          } catch (error: any) {
            console.error('Error generating packing slip:', error)
            alert(error?.message || 'Unable to generate packing slip')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Cancel Order (Netlify cancelOrder function)
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      if (!doc) return null

      return {
        name: 'cancelOrder',
        label: 'Cancel Order',
        icon: TrashIcon,
        tone: 'critical',
        onHandle: async () => {
          const confirmed = window.confirm('Cancel this order? This cannot be undone.')
          if (!confirmed) {
            props.onComplete()
            return
          }
          const reason = prompt('Reason for cancellation (optional):')?.trim() || undefined
          try {
            const orderId = normalizeDocumentId(doc._id || id)
            if (!orderId) {
              alert('Publish the order before cancelling.')
              props.onComplete()
              return
            }
            const response = await callNetlifyFunction('cancelOrder', {
              json: {
                orderId,
                orderNumber: doc.orderNumber,
                stripePaymentIntentId: (doc as any)?.paymentIntentId,
                reason,
              },
            })
            if (!response.ok) {
              const message = await readResponseMessage(response)
              throw new Error(message)
            }
            alert('Order cancelled.')
          } catch (error) {
            console.error('Cancel order failed', error)
            alert((error as Error)?.message || 'Unable to cancel order.')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Add/Edit Tracking
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      const stateFlags = getStateFlags(doc)

      return {
        name: 'addTracking',
        label: stateFlags.tracking ? 'Edit Tracking' : 'Add Tracking',
        icon: PackageIcon,
        tone: 'primary',
        disabled: !doc || doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc) {
            props.onComplete()
            return
          }

          const trackingNumber = prompt('Enter tracking number:', stateFlags.tracking || '')
          const normalized = trackingNumber?.trim()
          if (!normalized) {
            props.onComplete()
            return
          }

          const client = context.getClient({apiVersion: SANITY_API_VERSION})
          const patchTargets = resolvePatchTargets(id)

          try {
            for (const targetId of patchTargets) {
              try {
                await client
                  .patch(targetId)
                  .set({
                    manualTrackingNumber: normalized,
                    trackingNumber: normalized,
                    'fulfillment.trackingNumber': normalized,
                    'fulfillment.status': 'shipped',
                  })
                  .commit({autoGenerateArrayKeys: true})
              } catch (patchErr: any) {
                if (patchErr?.statusCode !== 404) {
                  throw patchErr
                }
              }
            }
            alert('Tracking number saved.')
          } catch (error) {
            console.error('Error adding tracking:', error)
            alert('Failed to add tracking number')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // View/Print or Create Shipping Label
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      const stateFlags = getStateFlags(doc)
      const hasLabel = Boolean(stateFlags.labelUrl)

      return {
        name: 'createShippingLabel',
        label: hasLabel ? 'View/Print Label' : 'Create Label',
        icon: PackageIcon,
        tone: hasLabel ? 'default' : 'primary',
        disabled: !doc || !doc?.shippingAddress || doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc) {
            props.onComplete()
            return
          }
          if (hasLabel && stateFlags.labelUrl) {
            openExternalUrl(stateFlags.labelUrl)
            props.onComplete()
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          if (!orderId) {
            alert('Publish the order before creating a label.')
            props.onComplete()
            return
          }

          try {
            const response = await fetch('/.netlify/functions/easypostCreateLabel', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({orderId}),
            })

            const payload = await response.clone().json().catch(() => null as any)

            if (!response.ok || (payload && payload.error)) {
              const message =
                (payload && (payload.error || payload.message)) ||
                (await readResponseMessage(response))
              throw new Error(message)
            }

            const labelUrl =
              typeof payload?.labelUrl === 'string' ? payload.labelUrl.trim() : undefined
            const trackingUrl =
              typeof payload?.trackingUrl === 'string' ? payload.trackingUrl.trim() : undefined
            const trackingNumber =
              typeof payload?.trackingNumber === 'string'
                ? payload.trackingNumber.trim()
                : undefined
            const shipmentId =
              typeof payload?.shipmentId === 'string' ? payload.shipmentId.trim() : undefined
            const trackerId =
              typeof payload?.trackerId === 'string' ? payload.trackerId.trim() : undefined
            const carrier = typeof payload?.carrier === 'string' ? payload.carrier.trim() : undefined
            const service = typeof payload?.service === 'string' ? payload.service.trim() : undefined
            const labelCreatedAt =
              typeof payload?.labelCreatedAt === 'string' ? payload.labelCreatedAt : undefined
            const labelCost =
              typeof payload?.rate === 'number' && Number.isFinite(payload.rate)
                ? Number(payload.rate)
                : undefined

            const updates: Record<string, any> = {}
            if (labelUrl) updates.shippingLabelUrl = labelUrl
            if (trackingUrl) {
              updates.trackingUrl = trackingUrl
              updates['fulfillment.trackingUrl'] = trackingUrl
            }
            if (trackingNumber) {
              updates.trackingNumber = trackingNumber
              updates['fulfillment.trackingNumber'] = trackingNumber
              updates['fulfillment.status'] = 'shipped'
            }
            if (shipmentId) updates.easyPostShipmentId = shipmentId
            if (trackerId) updates.easyPostTrackerId = trackerId
            if (carrier) updates['fulfillment.carrier'] = carrier
            if (service) updates['fulfillment.service'] = service
            if (labelCreatedAt) updates.labelCreatedAt = labelCreatedAt
            if (labelCost !== undefined) updates.labelCost = labelCost

            if (Object.keys(updates).length > 0) {
              const client = context.getClient({apiVersion: SANITY_API_VERSION})
              const patchTargets = resolvePatchTargets(id)
              for (const targetId of patchTargets) {
                try {
                  await client.patch(targetId).set(updates).commit({autoGenerateArrayKeys: true})
                } catch (patchErr: any) {
                  const msg = (patchErr?.message || '').toString().toLowerCase()
                  const isReadOnly = msg.includes('read-only') || patchErr?.statusCode === 403
                  if (patchErr?.statusCode === 404) continue
                  if (isReadOnly) {
                    console.warn('Skipping local patch on read-only document', {targetId, patchErr})
                    continue
                  }
                  throw patchErr
                }
              }
            }

            if (labelUrl || trackingUrl) {
              openExternalUrl(labelUrl || trackingUrl)
            }

            alert(
              trackingNumber
                ? `Label created! Tracking: ${trackingNumber}`
                : 'Shipping label created via EasyPost.',
            )
          } catch (error) {
            console.error('Error creating shipping label:', error)
            alert((error as Error)?.message || 'Failed to create shipping label')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Mark as Fulfilled / Unfulfilled
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published
      const stateFlags = getStateFlags(doc)

      return {
        label: stateFlags.isFulfilled ? 'Mark Unfulfilled' : 'Mark Fulfilled',
        icon: PackageIcon,
        tone: stateFlags.isFulfilled ? 'caution' : 'positive',
        disabled: !doc || doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc) return

          if (
            !confirmAction(
              stateFlags.isFulfilled
                ? 'Mark this order as unfulfilled?'
                : 'Mark this order as fulfilled?',
            )
          ) {
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          if (!orderId) {
            alert('Publish the order before marking it fulfilled.')
            props.onComplete()
            return
          }

          try {
            const nextStatus = stateFlags.isFulfilled ? 'unfulfilled' : 'fulfilled'
            const client = context.getClient({apiVersion: SANITY_API_VERSION})
            const patchTargets = resolvePatchTargets(id)
            for (const targetId of patchTargets) {
              try {
                await client
                  .patch(targetId)
                  .set({
                    status: nextStatus,
                    fulfilledAt: nextStatus === 'fulfilled' ? new Date().toISOString() : undefined,
                    'fulfillment.status': nextStatus === 'fulfilled' ? 'delivered' : 'unfulfilled',
                    'fulfillment.deliveredAt':
                      nextStatus === 'fulfilled' ? new Date().toISOString() : undefined,
                  })
                  .commit({autoGenerateArrayKeys: true})
              } catch (patchErr: any) {
                if (patchErr?.statusCode !== 404) {
                  throw patchErr
                }
              }
            }

            alert(
              nextStatus === 'fulfilled'
                ? 'Order marked as fulfilled.'
                : 'Order marked as unfulfilled.',
            )
          } catch (error) {
            console.error('Error marking as fulfilled:', error)
            alert((error as Error)?.message || 'Error updating order')
          } finally {
            props.onComplete()
          }
        },
      }
    },

    // Refund in Stripe
    (props) => {
      const {id, draft, published} = props
      const doc = draft || published

      return {
        label: 'Refund in Stripe',
        icon: ResetIcon,
        tone: 'critical',
        disabled:
          !doc ||
          !doc?.paymentIntentId ||
          doc?.status === 'refunded' ||
          doc?.status === 'cancelled',
        onHandle: async () => {
          if (!doc || !doc.paymentIntentId) return

          const orderTotal = parseCurrencyAmount(doc.totalAmount)
          const amountInput = prompt(
            `Enter refund amount (max: $${orderTotal.toFixed(2)}):`,
            orderTotal > 0 ? orderTotal.toFixed(2) : '',
          )
          if (!amountInput) return

          const refundAmount = parseFloat(amountInput)
          if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            alert('Invalid refund amount')
            return
          }

          if (orderTotal > 0 && refundAmount - orderTotal > 0.001) {
            alert(`Refund amount cannot exceed order total of $${orderTotal.toFixed(2)}`)
            return
          }

          const reasonInput = prompt('Refund reason (optional):')
          const reason = reasonInput ? reasonInput.trim() : undefined

          if (!confirmAction(`Refund $${refundAmount.toFixed(2)} to customer?`)) {
            return
          }

          const orderId = normalizeDocumentId(doc._id || id)
          if (!orderId) {
            alert('Publish the order before processing refunds.')
            return
          }

          const amountCents = Math.round(refundAmount * 100)

          try {
            const response = await callNetlifyFunction('createRefund', {
              json: {
                orderId,
                amount: refundAmount,
                amountCents,
                reason,
              },
            })

            let payload: any = null
            try {
              payload = await response.clone().json()
            } catch {
              payload = null
            }

            if (!response.ok || (payload && payload.error)) {
              const message =
                (payload && (payload.error || payload.message)) ||
                (await readResponseMessage(response))
              throw new Error(message)
            }

            alert('Refund processed successfully!')
          } catch (error) {
            console.error('Error processing refund:', error)
            alert((error as Error)?.message || 'Error processing refund')
          } finally {
            props.onComplete()
          }
        },
      }
    },
  ]
}
