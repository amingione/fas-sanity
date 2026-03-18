import {defineField, defineType} from 'sanity'

const CURRENCY_OPTIONS = [
  {title: 'USD', value: 'USD'},
]

const INVOICE_STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'Payable', value: 'payable'},
  {title: 'Pending', value: 'pending'},
  {title: 'Sent', value: 'sent'},
  {title: 'Paid', value: 'paid'},
  {title: 'Partially Paid', value: 'partially_paid'},
  {title: 'Overdue', value: 'overdue'},
  {title: 'Cancelled', value: 'cancelled'},
]

const addressFields = [
  defineField({name: 'name', title: 'Name', type: 'string'}),
  defineField({name: 'email', title: 'Email', type: 'string'}),
  defineField({name: 'phone', title: 'Phone', type: 'string'}),
  defineField({name: 'addressLine1', title: 'Address Line 1', type: 'string'}),
  defineField({name: 'addressLine2', title: 'Address Line 2', type: 'string'}),
  defineField({name: 'city', title: 'City', type: 'string'}),
  defineField({name: 'state', title: 'State', type: 'string'}),
  defineField({name: 'postalCode', title: 'Postal Code', type: 'string'}),
  defineField({name: 'country', title: 'Country', type: 'string'}),
]

export default defineType({
  name: 'invoice',
  title: 'Invoices',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string'}),
    defineField({name: 'invoiceNumber', title: 'Invoice Number', type: 'string'}),
    defineField({name: 'orderNumber', title: 'Order Number', type: 'string'}),
    defineField({name: 'quoteNumber', title: 'Quote Number', type: 'string'}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: INVOICE_STATUS_OPTIONS},
      initialValue: 'draft',
    }),
    defineField({name: 'invoiceDate', title: 'Invoice Date', type: 'date'}),
    defineField({name: 'dueDate', title: 'Due Date', type: 'date'}),
    defineField({name: 'paymentTerms', title: 'Payment Terms', type: 'string'}),
    defineField({name: 'deliveryMethod', title: 'Delivery Method', type: 'string', options: {list: [
      {title: 'Email', value: 'email'},
      {title: 'Print', value: 'print'},
      {title: 'Email + Print', value: 'email_and_print'},
      {title: 'Portal Only', value: 'portal'},
    ]}, initialValue: 'email'}),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      options: {list: CURRENCY_OPTIONS},
      initialValue: 'USD',
    }),
    defineField({name: 'customerRef', title: 'Customer', type: 'reference', to: [{type: 'customer'}]}),
    defineField({name: 'vendorRef', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({name: 'orderRef', title: 'Order', type: 'reference', to: [{type: 'vendorOrder'}]}),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [
        defineField({
          name: 'invoiceLineItem',
          title: 'Invoice Line Item',
          type: 'object',
          fields: [
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({name: 'description', title: 'Description', type: 'text', rows: 3}),
            defineField({name: 'sku', title: 'SKU', type: 'string'}),
            defineField({name: 'kind', title: 'Kind', type: 'string'}),
            defineField({name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
            defineField({name: 'quantity', title: 'Quantity', type: 'number'}),
            defineField({name: 'unitPrice', title: 'Unit Price', type: 'number'}),
            defineField({name: 'total', title: 'Line Total', type: 'number'}),
            defineField({name: 'lineTotal', title: 'Line Total (Canonical)', type: 'number'}),
            defineField({name: 'optionSummary', title: 'Option Summary', type: 'string'}),
            defineField({name: 'optionDetails', title: 'Option Details', type: 'text', rows: 2}),
          ],
        }),
      ],
    }),
    defineField({name: 'subtotal', title: 'Subtotal', type: 'number'}),
    defineField({name: 'amountSubtotal', title: 'Amount Subtotal', type: 'number'}),
    defineField({name: 'tax', title: 'Tax', type: 'number'}),
    defineField({name: 'amountTax', title: 'Amount Tax', type: 'number'}),
    defineField({name: 'taxRate', title: 'Tax Rate %', type: 'number'}),
    defineField({name: 'shipping', title: 'Shipping', type: 'number'}),
    defineField({name: 'amountShipping', title: 'Amount Shipping', type: 'number'}),
    defineField({name: 'total', title: 'Total', type: 'number'}),
    defineField({name: 'amountPaid', title: 'Amount Paid', type: 'number'}),
    defineField({name: 'amountDue', title: 'Amount Due', type: 'number'}),
    defineField({
      name: 'billTo',
      title: 'Bill To',
      type: 'object',
      fields: addressFields,
    }),
    defineField({
      name: 'shipTo',
      title: 'Ship To',
      type: 'object',
      fields: addressFields,
    }),
    defineField({name: 'paymentIntentId', title: 'Payment Intent ID', type: 'string'}),
    defineField({name: 'stripePaymentIntentId', title: 'Stripe Payment Intent ID', type: 'string'}),
    defineField({name: 'shippingLabelUrl', title: 'Shipping Label URL', type: 'url'}),
    defineField({name: 'trackingNumber', title: 'Tracking Number', type: 'string'}),
    defineField({name: 'trackingUrl', title: 'Tracking URL', type: 'url'}),
    defineField({name: 'customerNotes', title: 'Customer Notes', type: 'text', rows: 3}),
    defineField({name: 'terms', title: 'Terms', type: 'text', rows: 4}),
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
    defineField({name: 'vendorOrderRef', title: 'Vendor Order', type: 'reference', to: [{type: 'vendorOrder'}]}),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 4}),
  ],
  preview: {
    select: {
      title: 'invoiceNumber',
      subtitle: 'status',
      amount: 'total',
      company: 'vendorRef.companyName',
    },
    prepare(selection) {
      const title = selection.title || 'Invoice'
      const status = selection.subtitle || 'status'
      const amount = typeof selection.amount === 'number' ? ` · $${selection.amount.toFixed(2)}` : ''
      const company = selection.company ? ` · ${selection.company}` : ''
      return {
        title,
        subtitle: `${status}${amount}${company}`,
      }
    },
  },
})
