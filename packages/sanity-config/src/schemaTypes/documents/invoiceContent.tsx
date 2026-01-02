import {defineType, defineField, defineArrayMember} from 'sanity'
import {BillToInput, InvoiceNumberInput, ShipToInput} from './invoiceContentInputs'

function fmt(n?: number) {
  return typeof n === 'number' && !isNaN(n) ? Number(n).toFixed(2) : '0.00'
}


export default defineType({
  name: 'invoice',
  title: 'Invoice',
  type: 'document',
  fieldsets: [
    {name: 'basicInfo', title: 'Basic Info'},
    {name: 'customerBilling', title: 'Customer & Billing'},
    {name: 'lineItems', title: 'Line Items'},
    {name: 'pricing', title: 'Pricing'},
    {name: 'relatedDocs', title: 'Related Documents'},
    {name: 'notesAttachments', title: 'Notes & Attachments'},
    {
      name: 'stripeIntegration',
      title: 'Stripe Integration',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),

    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      description: 'Auto-generated: INV-###### or matches order number',
      components: {input: InvoiceNumberInput},
      readOnly: true,
      validation: (Rule) =>
        Rule.required().custom((val) => {
          if (typeof val !== 'string' || !val.trim()) return 'Invoice number is required'
          if (!/^INV-\d+$/.test(val.trim())) return 'Invoice number must be in format INV-XXXXXX'
          return true
        }),
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      description: 'Matches the related order number when available',
      readOnly: true,
      fieldset: 'basicInfo',
      hidden: ({document}) => !document?.orderNumber,
    }),

    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Paid', value: 'paid'},
          {title: 'Refunded', value: 'refunded'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'invoiceDate',
      title: 'Invoice Date',
      type: 'date',
      initialValue: () => new Date().toISOString().slice(0, 10),
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'dueDate',
      title: 'Due Date',
      type: 'date',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (!value) return true
          const invoiceDate = context?.document?.invoiceDate
          const paymentTerms = context?.document?.paymentTerms
          if (!invoiceDate) return true
          const normalizedTerms =
            typeof paymentTerms === 'string' ? paymentTerms.trim().toLowerCase() : ''
          const isDueOnReceipt = normalizedTerms === 'due on receipt'
          if (typeof invoiceDate !== 'string' || typeof value !== 'string') return true

          const invoiceTime = Date.parse(invoiceDate)
          const dueTime = Date.parse(value)

          if (Number.isNaN(invoiceTime) || Number.isNaN(dueTime)) return true

          if (isDueOnReceipt) {
            return dueTime >= invoiceTime ? true : 'Due date cannot be before invoice date'
          }
          return dueTime > invoiceTime ? true : 'Due date must be after invoice date'
        }),
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'paymentTerms',
      title: 'Payment Terms',
      type: 'string',
      options: {list: ['Due on receipt', 'Net 15', 'Net 30', 'Net 60', 'Net 90']},
      initialValue: 'Due on receipt',
      fieldset: 'basicInfo',
    }),

    defineField({
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
      fieldset: 'customerBilling',
    }),

    defineField({
      name: 'billTo',
      title: 'Bill To',
      type: 'billTo',
      components: {input: BillToInput},
      fieldset: 'customerBilling',
    }),

    defineField({
      name: 'shipTo',
      title: 'Ship To (if different)',
      type: 'shipTo',
      options: {collapsible: true, collapsed: true},
      components: {input: ShipToInput},
      fieldset: 'customerBilling',
    }),

    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [defineArrayMember({type: 'invoiceLineItem'})],
      validation: (Rule) => Rule.required().min(1),
      fieldset: 'lineItems',
    }),

    // PRICING SECTION - Simple fields that match webhook data
    defineField({
      name: 'subtotal',
      title: 'Subtotal',
      type: 'number',
      readOnly: true,
      fieldset: 'pricing',
    }),

    defineField({
      name: 'tax',
      title: 'Tax',
      type: 'number',
      description: 'Tax amount from payment processor',
      readOnly: true,
      fieldset: 'pricing',
    }),

    defineField({
      name: 'shipping',
      title: 'Shipping Cost',
      type: 'number',
      description: 'Shipping amount from payment processor',
      readOnly: true,
      fieldset: 'pricing',
    }),

    defineField({
      name: 'discountLabel',
      title: 'Discount Label',
      type: 'string',
      readOnly: true,
      fieldset: 'pricing',
    }),
    defineField({
      name: 'discountType',
      title: 'Discount Type',
      type: 'string',
      options: {
        list: [
          {title: 'None', value: 'none'},
          {title: 'Amount ($)', value: 'amount'},
          {title: 'Percent (%)', value: 'percent'},
        ],
        layout: 'radio',
      },
      initialValue: 'none',
      fieldset: 'pricing',
    }),
    defineField({
      name: 'discountValue',
      title: 'Discount Value',
      type: 'number',
      description: 'Dollar amount or percentage',
      fieldset: 'pricing',
    }),
    defineField({
      name: 'taxRate',
      title: 'Tax Rate %',
      type: 'number',
      description: 'e.g., 7.0 for 7%',
      fieldset: 'pricing',
    }),
    defineField({
      name: 'total',
      title: 'Total',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
      fieldset: 'pricing',
    }),

    // SHIPPING DETAILS - Advanced object for manual fulfillment
    defineField({
      name: 'shippingDetails',
      type: 'object',
      title: 'Shipping & Fulfillment',
      description: 'Advanced shipping options for manual fulfillment',
      fieldset: 'pricing',
      options: {
        collapsible: true,
        collapsed: true,
      },
      fields: [
        {
          name: 'requiresShipping',
          type: 'boolean',
          title: 'Requires Shipping',
          description: 'Disable for in-store pickup or install-only services',
          initialValue: true,
        },
        {
          name: 'shippingMethod',
          type: 'string',
          title: 'Shipping Method',
          description: 'Selected carrier and service level',
          options: {
            list: [
              {title: 'USPS Ground Advantage', value: 'usps_ground_advantage'},
              {title: 'USPS Priority Mail', value: 'usps_priority'},
              {title: 'USPS Priority Mail Express', value: 'usps_express'},
              {title: 'UPS Ground', value: 'ups_ground'},
              {title: 'UPS 2nd Day Air', value: 'ups_2day'},
              {title: 'UPS Next Day Air', value: 'ups_next_day'},
              {title: 'FedEx Ground', value: 'fedex_ground'},
              {title: 'FedEx 2Day', value: 'fedex_2day'},
              {title: 'FedEx Standard Overnight', value: 'fedex_overnight'},
              {title: 'Customer Pickup', value: 'pickup'},
              {title: 'Local Delivery', value: 'local_delivery'},
            ],
          },
        },
        {
          name: 'easypostRateId',
          type: 'string',
          title: 'EasyPost Rate ID',
          description: 'Selected rate from EasyPost quote (rate_...)',
          readOnly: true,
        },
        {
          name: 'easypostShipmentId',
          type: 'string',
          title: 'EasyPost Shipment ID',
          description: 'Created shipment reference (shp_...)',
          readOnly: true,
        },
        {
          name: 'packageWeight',
          type: 'number',
          title: 'Package Weight (lbs)',
          description: 'Total weight including packaging',
          validation: (Rule) => Rule.min(0).precision(2),
        },
        {
          name: 'packageDimensions',
          type: 'object',
          title: 'Package Dimensions',
          description: 'Box size for rate calculation',
          fields: [
            {
              name: 'length',
              type: 'number',
              title: 'Length (inches)',
              validation: (Rule) => Rule.min(0).precision(2),
            },
            {
              name: 'width',
              type: 'number',
              title: 'Width (inches)',
              validation: (Rule) => Rule.min(0).precision(2),
            },
            {
              name: 'height',
              type: 'number',
              title: 'Height (inches)',
              validation: (Rule) => Rule.min(0).precision(2),
            },
          ],
        },
        {
          name: 'availableRates',
          type: 'array',
          title: 'Available Shipping Rates',
          description: 'Rates fetched from EasyPost',
          readOnly: true,
          of: [
            {
              type: 'object',
              name: 'shippingRate',
              fields: [
                {
                  name: 'rateId',
                  type: 'string',
                  title: 'Rate ID',
                },
                {
                  name: 'carrier',
                  type: 'string',
                  title: 'Carrier',
                },
                {
                  name: 'service',
                  type: 'string',
                  title: 'Service',
                },
                {
                  name: 'rate',
                  type: 'number',
                  title: 'Rate ($)',
                },
                {
                  name: 'deliveryDays',
                  type: 'number',
                  title: 'Delivery Days',
                },
                {
                  name: 'estimatedDeliveryDate',
                  type: 'date',
                  title: 'Est. Delivery',
                  readOnly: true,
                },
              ],
              preview: {
                select: {
                  carrier: 'carrier',
                  service: 'service',
                  rate: 'rate',
                  days: 'deliveryDays',
                },
                prepare({carrier, service, rate, days}) {
                  return {
                    title: `${carrier} ${service}`,
                    subtitle: `$${rate} • ${days} days`,
                  }
                },
              },
            },
          ],
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
          name: 'labelUrl',
          type: 'url',
          title: 'Shipping Label URL',
        },
        {
          name: 'labelPurchasedAt',
          type: 'datetime',
          title: 'Label Purchased',
          readOnly: true,
        },
        {
          name: 'fulfillmentStatus',
          type: 'string',
          title: 'Fulfillment Status',
          options: {
            list: [
              {title: 'Not Shipped', value: 'not_shipped'},
              {title: 'Label Created', value: 'label_created'},
              {title: 'Shipped', value: 'shipped'},
              {title: 'Delivered', value: 'delivered'},
            ],
          },
          initialValue: 'not_shipped',
        },
      ],
    }),

    defineField({
      name: 'orderRef',
      title: 'Related Order',
      type: 'reference',
      to: [{type: 'order'}],
      fieldset: 'relatedDocs',
      weak: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sourceQuote',
      title: 'Source Quote',
      type: 'reference',
      to: [{type: 'quote'}],
      description: 'Quote that generated this invoice',
      readOnly: true,
      fieldset: 'relatedDocs',
    }),
    defineField({
      name: 'emailLog',
      title: 'Email Log',
      type: 'reference',
      to: [{type: 'emailLog'}],
      description: 'Email log when invoice was sent',
      readOnly: true,
      fieldset: 'relatedDocs',
    }),
    defineField({
      name: 'sentAt',
      title: 'Sent At',
      type: 'datetime',
      description: 'When invoice was emailed to customer',
      readOnly: true,
      fieldset: 'relatedDocs',
    }),
    defineField({
      name: 'workOrderRef',
      title: 'Work Order',
      type: 'reference',
      to: [{type: 'workOrder'}],
      fieldset: 'relatedDocs',
    }),
    defineField({
      name: 'quote',
      title: 'Related Quote',
      type: 'reference',
      to: [{type: 'buildQuote'}],
      fieldset: 'relatedDocs',
    }),

    defineField({
      name: 'customerNotes',
      title: 'Notes (Visible to Customer)',
      type: 'text',
      rows: 3,
      fieldset: 'notesAttachments',
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes (Hidden)',
      type: 'text',
      rows: 3,
      fieldset: 'notesAttachments',
    }),

    defineField({
      name: 'attachments',
      title: 'Attachments',
      description: 'Upload PDFs, images, or signed documents',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'file',
          options: {accept: 'application/pdf,image/*', storeOriginalFilename: true},
          fields: [defineField({name: 'label', title: 'File Label', type: 'string'})],
        }),
      ],
      fieldset: 'notesAttachments',
    }),

    defineField({
      name: 'stripeInvoiceId',
      title: 'Stripe Invoice ID',
      type: 'string',
      readOnly: true,
      hidden: ({document}) => !document?.stripeInvoiceId,
      fieldset: 'stripeIntegration',
    }),
    defineField({
      name: 'stripeInvoiceStatus',
      title: 'Stripe Status',
      type: 'string',
      readOnly: true,
      hidden: ({document}) => !document?.stripeInvoiceId,
      fieldset: 'stripeIntegration',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Last Synced',
      type: 'datetime',
      readOnly: true,
      hidden: ({document}) => !document?.stripeInvoiceId,
      fieldset: 'stripeIntegration',
    }),
  ],

  initialValue: async () => ({status: 'pending'}),

  preview: {
    select: {
      title: 'title',
      invoiceNumber: 'invoiceNumber',
      billToName: 'billTo.name',
      total: 'total',
      status: 'status',
    },
    prepare(sel) {
      const {title, invoiceNumber, billToName, total, status} = sel as any
      const name = billToName || title || 'Invoice'
      const reference = invoiceNumber || ''
      const header = reference ? `${name} • ${reference}` : name
      const amount = typeof total === 'number' ? ` – $${fmt(total)}` : ''
      const st = status ? ` • ${status.toUpperCase()}` : ''
      return {title: `${header}${amount}${st}`}
    },
  },
})
