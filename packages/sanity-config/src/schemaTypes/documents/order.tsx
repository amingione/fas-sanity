// schemas/order.tsx
import type {ComponentType} from 'react'
import {defineField, defineType} from 'sanity'
import {PackageIcon, CheckmarkCircleIcon, RestoreIcon, CloseIcon, UndoIcon} from '@sanity/icons'
import {OrderHeader} from '../components/OrderHeader'
import {deriveWorkflowState} from '../../utils/orderWorkflow'

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  icon: PackageIcon as unknown as ComponentType,
  groups: [
    {name: 'overview', title: 'Overview', default: true},
    {name: 'fulfillment', title: 'Fulfillment'},
    {name: 'documents', title: 'Documents'},
    {name: 'technical', title: 'Technical'},
  ],
  fields: [
    // CUSTOMER REFERENCE - First field, shows at top
    defineField({
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      group: 'overview',
      readOnly: true,
      description: 'Click to view customer profile',
    }),

    // CUSTOM HEADER COMPONENT - Shows below customer reference
    defineField({
      name: 'orderHeaderDisplay',
      title: 'Order Summary',
      // Use a string field so Studio renders the slot while the custom component handles display
      type: 'string',
      readOnly: true,
      components: {
        input: OrderHeader,
      },
      group: 'overview',
      hidden: false,
    }),

    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      group: 'overview',
      readOnly: true,
      hidden: false,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      title: 'Order Date',
      type: 'datetime',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      group: 'overview',
      hidden: false,
      options: {
        list: [
          {title: 'Paid', value: 'paid'},
          {title: 'Fulfilled', value: 'fulfilled'},
          {title: 'Delivered', value: 'delivered'},
          {title: 'Canceled', value: 'canceled'},
          {title: 'Refunded', value: 'refunded'},
        ],
        layout: 'dropdown',
      },
    }),
    defineField({
      name: 'orderType',
      title: 'Order Type',
      type: 'string',
      group: 'overview',
      hidden: true,
      readOnly: true,
      options: {
        list: [
          {title: 'Online', value: 'online'},
          {title: 'Retail', value: 'retail'},
          {title: 'Wholesale', value: 'wholesale'},
          {title: 'In-Store', value: 'in-store'},
          {title: 'Phone', value: 'phone'},
        ],
      },
      initialValue: 'online',
    }),
    defineField({
      name: 'paymentStatus',
      title: 'Payment Status',
      type: 'string',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'customerName',
      title: 'Customer Name',
      type: 'string',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'customerEmail',
      title: 'Customer Email',
      type: 'string',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'customerInstructions',
      title: 'Customer Instructions (Internal)',
      type: 'text',
      rows: 3,
      group: 'overview',
      description: 'Optional delivery notes. UX-only; not used by integrations.',
    }),
    defineField({
      name: 'opsInternalNotes',
      title: 'Ops Notes (Internal)',
      type: 'text',
      rows: 4,
      group: 'overview',
      description: 'Internal ops/support notes. UX-only; not used by integrations.',
    }),
    defineField({
      name: 'cart',
      title: 'Order Items',
      type: 'array',
      group: 'overview',
      of: [{type: 'orderCartItem'}],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'totalAmount',
      title: 'Total Amount',
      type: 'number',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'amountSubtotal',
      title: 'Subtotal',
      type: 'number',
      group: 'overview',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'amountTax',
      title: 'Tax',
      type: 'number',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'amountShipping',
      title: 'Shipping',
      type: 'number',
      group: 'overview',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'invoiceRef',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
      group: 'overview',
      description: 'Click to view invoice',
      hidden: ({document}) => !document?.invoiceRef,
    }),
    defineField({
      name: 'fulfillmentDetails',
      title: 'Fulfillment Information',
      type: 'object',
      group: 'fulfillment',
      options: {collapsible: true, collapsed: true},
      hidden: true,
      fields: [
        {
          name: 'status',
          title: 'Fulfillment Status',
          type: 'string',
          options: {
            list: [
              {title: 'Unfulfilled', value: 'unfulfilled'},
              {title: 'Processing', value: 'processing'},
              {title: 'Shipped', value: 'shipped'},
              {title: 'Delivered', value: 'delivered'},
            ],
            layout: 'dropdown',
          },
          initialValue: 'unfulfilled',
        },
        {
          name: 'shippingAddress',
          title: 'Shipping Address',
          type: 'text',
          rows: 5,
          readOnly: true,
          description: 'Deprecated: use structured shippingAddress fields instead',
          hidden: true,
        },
        {
          name: 'packageWeight',
          title: 'Package Weight (lbs)',
          type: 'number',
          description: 'Total weight in pounds',
        },
        {
          name: 'packageDimensions',
          title: 'Package Dimensions (L × W × H inches)',
          type: 'string',
          placeholder: 'e.g., 12 × 10 × 4',
          description: 'Length × Width × Height in inches',
        },
        {
          name: 'trackingNumber',
          title: 'Tracking Number',
          type: 'string',
          readOnly: true,
          description: 'Deprecated: use top-level trackingNumber instead',
          hidden: true,
        },
        {
          name: 'trackingDetails',
          title: 'Tracking Details',
          type: 'text',
          rows: 5,
          readOnly: true,
          description: 'Shipping service, tracking number, dates',
          hidden: ({parent}) => !parent?.trackingNumber,
        },
        {
          name: 'fulfillmentNotes',
          title: 'Fulfillment Notes',
          type: 'text',
          rows: 3,
          description: 'Internal notes about packing, shipping issues, etc.',
          hidden: true, // Hidden here because it's in the custom component
        },
      ],
    }),
    defineField({
      name: 'orderDocuments',
      title: 'Order Documents',
      type: 'array',
      group: 'documents',
      description: 'Packing slips and shipping labels',
      of: [
        {
          type: 'object',
          name: 'orderDocument',
          fields: [
            {
              name: 'documentType',
              title: 'Document Type',
              type: 'string',
              options: {
                list: [
                  {title: 'Packing Slip', value: 'packing_slip'},
                  {title: 'Shipping Label', value: 'shipping_label'},
                  {title: 'Other', value: 'other'},
                ],
              },
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'file',
              title: 'PDF File',
              type: 'file',
              options: {accept: 'application/pdf'},
            },
            {
              name: 'url',
              title: 'Document URL',
              type: 'url',
              description: 'External link to document (if not uploaded)',
            },
            {
              name: 'createdAt',
              title: 'Created',
              type: 'datetime',
              initialValue: () => new Date().toISOString(),
            },
          ],
          preview: {
            select: {
              type: 'documentType',
              fileName: 'file.asset.originalFilename',
              url: 'url',
            },
            prepare({type, fileName, url}) {
              const typeLabel: Record<string, string> = {
                packing_slip: 'Packing Slip',
                shipping_label: 'Shipping Label',
                other: 'Document',
              }
              const label = type ? (typeLabel[type] ?? 'Document') : 'Document'
              return {title: label, subtitle: fileName || url || 'No file'}
            },
          },
        },
      ],
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      group: 'technical',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'paymentIntentId',
      title: 'Payment Intent ID',
      type: 'string',
      group: 'technical',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'stripePaymentIntentId',
      title: 'Stripe Payment Intent ID',
      type: 'string',
      group: 'technical',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'stripeSessionId',
      title: 'Stripe Session ID',
      type: 'string',
      group: 'technical',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'easyPostShipmentId',
      title: 'EasyPost Shipment ID',
      type: 'string',
      group: 'technical',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'labelPurchased',
      title: 'Label Purchased',
      type: 'boolean',
      group: 'fulfillment',
      readOnly: true,
      initialValue: false,
      hidden: false,
    }),
    defineField({
      name: 'labelPurchasedAt',
      title: 'Label Purchased At',
      type: 'datetime',
      group: 'fulfillment',
      readOnly: true,
      hidden: false,
    }),
    defineField({
      name: 'labelPurchasedBy',
      title: 'Label Purchased By',
      type: 'string',
      group: 'technical',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'weight',
      title: 'Package Weight',
      type: 'shipmentWeight',
      group: 'fulfillment',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'dimensions',
      title: 'Package Dimensions',
      type: 'packageDimensions',
      group: 'fulfillment',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      group: 'fulfillment',
      readOnly: true,
      hidden: false,
      fields: [
        {name: 'name', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'email', type: 'string'},
        {name: 'addressLine1', type: 'string'},
        {name: 'addressLine2', type: 'string'},
        {name: 'city', type: 'string'},
        {name: 'state', type: 'string'},
        {name: 'postalCode', type: 'string'},
        {name: 'country', type: 'string'},
      ],
    }),
    defineField({
      name: 'billingAddress',
      type: 'object',
      hidden: true,
      fields: [
        {name: 'name', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'email', type: 'string'},
        {name: 'addressLine1', type: 'string'},
        {name: 'addressLine2', type: 'string'},
        {name: 'city', type: 'string'},
        {name: 'state', type: 'string'},
        {name: 'postalCode', type: 'string'},
        {name: 'country', type: 'string'},
      ],
    }),
    defineField({name: 'carrier', type: 'string', hidden: true}),
    defineField({name: 'service', type: 'string', hidden: true}),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
      group: 'fulfillment',
      readOnly: true,
      hidden: false,
    }),
    defineField({name: 'trackingUrl', type: 'url', hidden: true}),
    defineField({name: 'shippedAt', type: 'datetime', hidden: true}),
    defineField({name: 'deliveredAt', type: 'datetime', hidden: true}),
    defineField({name: 'estimatedDeliveryDate', type: 'datetime', hidden: true}),
    defineField({name: 'easypostRateId', type: 'string', hidden: true}),
    defineField({
      name: 'stripeSummary',
      type: 'object',
      hidden: true,
      fields: [{name: 'data', type: 'text', title: 'Stripe Data (JSON)'}],
    }),
    defineField({name: 'amountDiscount', type: 'number', hidden: true}),
    defineField({name: 'paymentCaptured', type: 'boolean', hidden: true}),
    defineField({name: 'paymentCapturedAt', type: 'datetime', hidden: true}),
    defineField({name: 'cardBrand', type: 'string', hidden: true}),
    defineField({name: 'cardLast4', type: 'string', hidden: true}),
    defineField({name: 'receiptUrl', type: 'url', hidden: true}),
    defineField({name: 'chargeId', type: 'string', hidden: true}),
    defineField({name: 'confirmationEmailSent', type: 'boolean', hidden: true}),
    defineField({name: 'webhookNotified', type: 'boolean', hidden: true}),
    defineField({name: 'slug', type: 'slug', hidden: true}),
    defineField({
      name: 'fulfillment',
      type: 'object',
      hidden: true,
      fields: [
        {name: 'status', type: 'string'},
        {name: 'fulfillmentNotes', type: 'text'},
        {name: 'shippedAt', type: 'datetime'},
        {name: 'deliveredAt', type: 'datetime'},
      ],
    }),
    defineField({
      name: 'invoiceData',
      type: 'object',
      hidden: true,
      fields: [
        {name: 'invoiceNumber', type: 'string'},
        {name: 'invoiceId', type: 'string'},
        {name: 'invoiceUrl', type: 'url'},
        {name: 'pdfUrl', type: 'url'},
      ],
    }),
    defineField({
      name: 'packageDimensions',
      type: 'object',
      hidden: true,
      fields: [
        {name: 'weight', type: 'number'},
        {name: 'length', type: 'number'},
        {name: 'width', type: 'number'},
        {name: 'height', type: 'number'},
        {name: 'weightDisplay', type: 'string'},
        {name: 'dimensionsDisplay', type: 'string'},
      ],
    }),
    defineField({name: 'packingSlipUrl', type: 'url', hidden: true}),
    defineField({name: 'shippingLabelUrl', type: 'url', hidden: true}),
    defineField({name: 'shippingLabelFile', type: 'file', hidden: true}),
    defineField({name: 'shippingLabelRefunded', type: 'boolean', hidden: true}),
    defineField({name: 'shippingLabelRefundedAt', type: 'datetime', hidden: true}),
    defineField({name: 'shippingLabelRefundAmount', type: 'number', hidden: true}),
    defineField({name: 'labelCreatedAt', type: 'datetime', hidden: true}),
    defineField({
      name: 'labelCost',
      title: 'Label Cost',
      type: 'number',
      group: 'fulfillment',
      hidden: false,
    }),
    defineField({name: 'deliveryDays', type: 'number', hidden: true}),
    defineField({name: 'easyPostTrackerId', type: 'string', hidden: true}),
    defineField({name: 'paymentCaptureStrategy', type: 'string', hidden: true}),
    defineField({
      name: 'fulfillmentStatusDisplay',
      type: 'object',
      hidden: true,
      fields: [{name: 'display', type: 'string'}],
    }),
    defineField({
      name: 'amountRefunded',
      title: 'Amount Refunded',
      type: 'number',
      group: 'overview',
      hidden: ({document}) => document?.status !== 'refunded',
    }),
    defineField({
      name: 'lastRefundId',
      title: 'Last Refund ID',
      type: 'string',
      group: 'overview',
      hidden: ({document}) => document?.status !== 'refunded',
    }),
    defineField({
      name: 'lastRefundReason',
      title: 'Last Refund Reason',
      type: 'string',
      group: 'overview',
      hidden: ({document}) => document?.status !== 'refunded',
    }),
    defineField({
      name: 'lastRefundStatus',
      title: 'Last Refund Status',
      type: 'string',
      group: 'overview',
      hidden: ({document}) => document?.status !== 'refunded',
    }),
    defineField({
      name: 'lastRefundedAt',
      title: 'Last Refunded At',
      type: 'datetime',
      group: 'overview',
      hidden: ({document}) => document?.status !== 'refunded',
    }),
  ],
  preview: {
    select: {
      orderNumber: 'orderNumber',
      customerName: 'customerName',
      status: 'status',
      paymentStatus: 'paymentStatus',
      totalAmount: 'totalAmount',
      fulfillmentStatus: 'fulfillmentDetails.status',
      labelPurchased: 'labelPurchased',
      shippedAt: 'shippedAt',
      deliveredAt: 'deliveredAt',
    },
    prepare({
      orderNumber,
      customerName,
      status,
      paymentStatus,
      totalAmount,
      fulfillmentStatus,
      labelPurchased,
      shippedAt,
      deliveredAt,
    }) {
      const statusIconMap: Record<string, ComponentType> = {
        paid: PackageIcon as unknown as ComponentType,
        fulfilled: RestoreIcon as unknown as ComponentType,
        delivered: CheckmarkCircleIcon as unknown as ComponentType,
        canceled: CloseIcon as unknown as ComponentType,
        cancelled: CloseIcon as unknown as ComponentType,
        refunded: UndoIcon as unknown as ComponentType,
      }

      const normalize = (value?: string | null) =>
        typeof value === 'string' ? value.trim().toLowerCase() : ''

      const normalizedStatus = normalize(status)
      const normalizedFulfillment = normalize(fulfillmentStatus)

      const primaryStatus =
        normalizedStatus === 'canceled' || normalizedStatus === 'cancelled'
          ? 'cancelled'
          : normalizedStatus || normalizedFulfillment || 'unfulfilled'

      const statusLabel =
        primaryStatus.charAt(0).toUpperCase() + primaryStatus.slice(1).toLowerCase()

      const Icon = statusIconMap[primaryStatus] || statusIconMap[normalizedStatus] || PackageIcon

      const workflowState = deriveWorkflowState({
        paymentStatus,
        labelPurchased,
        shippedAt,
        deliveredAt,
      })
      const workflowDetails = [
        workflowState.label,
        workflowState.actionLabel ? `Action: ${workflowState.actionLabel}` : null,
      ]
        .filter(Boolean)
        .join(' • ')

      return {
        title: `${customerName || 'Unknown Customer'} — ${orderNumber || 'New Order'}`,
        subtitle: `$${totalAmount?.toFixed(2) || '0.00'} • ${workflowDetails || statusLabel}`,
        media: Icon,
      }
    },
  },
})
