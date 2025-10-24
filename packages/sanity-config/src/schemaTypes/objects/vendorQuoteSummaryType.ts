import { defineType, defineField } from 'sanity'

export const vendorQuoteSummaryType = defineType({
  name: 'vendorQuoteSummary',
  title: 'Vendor Quote',
  type: 'object',
  fields: [
    defineField({ name: 'quoteId', title: 'Quote ID', type: 'string' }),
    defineField({ name: 'status', title: 'Status', type: 'string' }),
    defineField({ name: 'dateSubmitted', title: 'Date Submitted', type: 'datetime' }),
    defineField({ name: 'description', title: 'Description', type: 'text' }),
  ],
})

