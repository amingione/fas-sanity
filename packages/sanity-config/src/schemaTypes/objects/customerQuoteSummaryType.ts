import {defineType, defineField} from 'sanity'

export const customerQuoteSummaryType = defineType({
  name: 'customerQuoteSummary',
  title: 'Quote Summary',
  type: 'object',
  fields: [
    defineField({name: 'quoteId', title: 'Quote ID', type: 'string'}),
    defineField({name: 'status', title: 'Status', type: 'string'}),
    defineField({name: 'dateRequested', title: 'Date Requested', type: 'datetime'}),
    defineField({name: 'notes', title: 'Notes', type: 'text'}),
  ],
})
