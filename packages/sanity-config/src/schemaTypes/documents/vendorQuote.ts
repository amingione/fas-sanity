import {defineField, defineType} from 'sanity'

const QUOTE_STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'Sent', value: 'sent'},
  {title: 'Approved', value: 'approved'},
  {title: 'Rejected', value: 'rejected'},
  {title: 'Expired', value: 'expired'},
  {title: 'Converted', value: 'converted'},
]

const PRICING_TIER_OPTIONS = [
  {title: 'Standard', value: 'standard'},
  {title: 'Preferred', value: 'preferred'},
  {title: 'Platinum', value: 'platinum'},
  {title: 'Custom', value: 'custom'},
]

export default defineType({
  name: 'vendorQuote',
  title: 'Vendor Quotes',
  type: 'document',
  fields: [
    defineField({name: 'quoteNumber', title: 'Quote Number', type: 'string'}),
    defineField({
      name: 'deliveryMethod',
      title: 'Delivery Method',
      type: 'string',
      options: {list: [
        {title: 'Email', value: 'email'},
        {title: 'Print', value: 'print'},
        {title: 'Email + Print', value: 'email_and_print'},
        {title: 'Portal Only', value: 'portal'},
      ]},
      initialValue: 'email',
    }),
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: QUOTE_STATUS_OPTIONS},
      initialValue: 'draft',
    }),
    defineField({
      name: 'pricingTier',
      title: 'Pricing Tier',
      type: 'string',
      options: {list: PRICING_TIER_OPTIONS},
      initialValue: 'standard',
    }),
    defineField({name: 'customDiscountPercentage', title: 'Custom Discount %', type: 'number'}),
    defineField({name: 'validUntil', title: 'Valid Until', type: 'date'}),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      of: [
        defineField({
          name: 'quoteItem',
          title: 'Quote Item',
          type: 'object',
          fields: [
            defineField({name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({name: 'sku', title: 'SKU', type: 'string'}),
            defineField({name: 'quantity', title: 'Quantity', type: 'number'}),
            defineField({name: 'unitPrice', title: 'Unit Price', type: 'number'}),
            defineField({name: 'subtotal', title: 'Subtotal', type: 'number'}),
            defineField({name: 'notes', title: 'Notes', type: 'text', rows: 2}),
          ],
        }),
      ],
    }),
    defineField({name: 'subtotal', title: 'Subtotal', type: 'number'}),
    defineField({name: 'shipping', title: 'Shipping', type: 'number'}),
    defineField({name: 'tax', title: 'Tax', type: 'number'}),
    defineField({name: 'total', title: 'Total', type: 'number'}),
    defineField({name: 'approvedAt', title: 'Approved At', type: 'datetime'}),
    defineField({name: 'sentAt', title: 'Sent At', type: 'datetime'}),
    defineField({name: 'lastEmailTo', title: 'Last Email Recipient', type: 'string'}),
    defineField({name: 'emailSendCount', title: 'Email Send Count', type: 'number', initialValue: 0}),
    defineField({
      name: 'emailStatus',
      title: 'Email Status',
      type: 'string',
      options: {list: [
        {title: 'Not Sent', value: 'not_sent'},
        {title: 'Sent', value: 'sent'},
        {title: 'Failed', value: 'failed'},
      ]},
      initialValue: 'not_sent',
    }),
    defineField({name: 'lastEmailError', title: 'Last Email Error', type: 'text', rows: 2}),
    defineField({name: 'lastPrintedAt', title: 'Last Printed At', type: 'datetime'}),
    defineField({name: 'printCount', title: 'Print Count', type: 'number', initialValue: 0}),
    defineField({name: 'convertedToOrder', title: 'Converted To Order', type: 'reference', to: [{type: 'vendorOrder'}]}),
    defineField({
      name: 'convertedToInvoice',
      title: 'Converted To Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
    }),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 4}),
  ],
  preview: {
    select: {
      title: 'quoteNumber',
      subtitle: 'status',
      company: 'vendor.companyName',
      total: 'total',
    },
    prepare(selection) {
      const title = selection.title || 'Vendor Quote'
      const status = selection.subtitle || 'status'
      const company = selection.company ? ` · ${selection.company}` : ''
      const total = typeof selection.total === 'number' ? ` · $${selection.total.toFixed(2)}` : ''
      return {title, subtitle: `${status}${company}${total}`}
    },
  },
})
