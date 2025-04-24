// schemaTypes/documents/quote.ts
import { defineType, defineField } from 'sanity'
import ConvertToInvoiceButton from '../../components/studio/ConvertToInvoiceButton'
import QuoteStatusWithTimeline from '../../components/inputs/QuoteStatusWithTimeline'

export default defineType({
  name: 'quote',
  title: 'Quote',
  type: 'document',
  fields: [
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{ type: 'customer' }]
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'product', type: 'string', title: 'Product' },
            { name: 'price', type: 'number', title: 'Price' },
            { name: 'quantity', type: 'number', title: 'Quantity' }
          ]
        }
      ]
    }),
    defineField({
      name: 'total',
      title: 'Total',
      type: 'number'
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    }),
    defineField({
      name: 'conversionStatus',
      title: 'Conversion Status',
      type: 'string',
      options: {
        list: ['Open', 'Converted', 'Archived'],
        layout: 'radio'
      },
      initialValue: 'Open'
    }),
    defineField({
      name: 'status',
      title: 'Quote Status',
      type: 'string',
      components: {
        input: QuoteStatusWithTimeline
      }
    }),
    defineField({
      name: 'timeline',
      title: 'Quote Timeline',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'action', type: 'string', title: 'Action' },
            { name: 'timestamp', type: 'datetime', title: 'Timestamp' }
          ]
        }
      ]
    }),
    defineField({
      name: 'convertToInvoice',
      type: 'string',
      title: 'Convert to Invoice',
      components: {
        input: ConvertToInvoiceButton
      },
      hidden: true
    })
  ],
  preview: {
    select: {
      title: 'customer.name',
      total: 'total',
      status: 'status'
    },
    prepare({ title, total, status }) {
      return {
        title: title || 'Unnamed Quote',
        subtitle: `$${total ?? 0} • ${status || 'Pending'}`
      }
    }
  },
})