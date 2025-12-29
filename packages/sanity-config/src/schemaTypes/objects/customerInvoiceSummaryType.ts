import {defineType, defineField} from 'sanity'

export const customerInvoiceSummaryType = defineType({
  name: 'customerInvoiceSummary',
  title: 'Invoice Summary',
  type: 'object',
  fields: [
    defineField({name: 'invoiceNumber', title: 'Invoice Number', type: 'string'}),
    defineField({name: 'status', title: 'Status', type: 'string'}),
    defineField({name: 'createdAt', title: 'Invoice Date', type: 'datetime'}),
    defineField({name: 'total', title: 'Total Amount', type: 'number'}),
  ],
})
