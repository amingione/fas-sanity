// schemaTypes/documents/quote.ts
import {defineType, defineField} from 'sanity'
import ConvertToInvoiceButton from '../../components/studio/ConvertToInvoiceButton'
import QuoteStatusWithTimeline from '../../components/inputs/QuoteStatusWithTimeline'

export default defineType({
  name: 'quote',
  title: 'Quote',
  type: 'document',
  fields: [
    // High-level
    defineField({ name: 'title', title: 'Title', type: 'string', initialValue: 'Untitled Quote' }),
    defineField({
      name: 'quoteNumber',
      title: 'Quote #',
      type: 'string',
      description: 'Human-friendly quote number. Can be edited.',
    }),

    // Customer links
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      description: 'Link to a saved customer record (optional).',
    }),

    // Bill To / Ship To (mirrors invoice)
    defineField({
      name: 'billTo',
      title: 'Bill To',
      type: 'object',
      options: { collapsible: true, collapsed: false },
      fields: [
        {name: 'name', type: 'string', title: 'Name'},
        {name: 'email', type: 'string', title: 'Email'},
        {name: 'phone', type: 'string', title: 'Phone'},
        {name: 'address_line1', type: 'string', title: 'Address Line 1'},
        {name: 'address_line2', type: 'string', title: 'Address Line 2'},
        {name: 'city_locality', type: 'string', title: 'City'},
        {name: 'state_province', type: 'string', title: 'State/Province'},
        {name: 'postal_code', type: 'string', title: 'Postal Code'},
        {name: 'country_code', type: 'string', title: 'Country Code'},
      ],
    }),
    defineField({
      name: 'shipTo',
      title: 'Ship To',
      type: 'object',
      options: { collapsible: true, collapsed: false },
      fields: [
        {name: 'name', type: 'string', title: 'Name'},
        {name: 'email', type: 'string', title: 'Email'},
        {name: 'phone', type: 'string', title: 'Phone'},
        {name: 'address_line1', type: 'string', title: 'Address Line 1'},
        {name: 'address_line2', type: 'string', title: 'Address Line 2'},
        {name: 'city_locality', type: 'string', title: 'City'},
        {name: 'state_province', type: 'string', title: 'State/Province'},
        {name: 'postal_code', type: 'string', title: 'Postal Code'},
        {name: 'country_code', type: 'string', title: 'Country Code'},
      ],
    }),

    // Line items (product or custom), mirrors invoice style
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'quoteLineItem',
          title: 'Line Item',
          fields: [
            // Choose a product OR provide a custom item
            {name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]},
            {name: 'customName', title: 'Custom Item Name', type: 'string'},
            {name: 'description', title: 'Description', type: 'text'},

            // Pricing
            {name: 'unitPrice', title: 'Unit Price (USD)', type: 'number'},
            {name: 'quantity', title: 'Quantity', type: 'number', initialValue: 1},
            {name: 'lineTotal', title: 'Line Total (auto)', type: 'number', readOnly: true},
          ],
          preview: {
            select: {name: 'customName', product: 'product.title', qty: 'quantity', price: 'unitPrice', total: 'lineTotal'},
            prepare({name, product, qty, price, total}) {
              const title = product || name || 'Item'
              const subtitle = `${qty ?? 1} × $${price ?? 0} = $${total ?? 0}`
              return {title, subtitle}
            },
          },
        },
      ],
    }),

    // Totals & adjustments (mirrors invoice)
    defineField({name: 'subtotal', title: 'Subtotal (auto)', type: 'number', readOnly: true}),
    defineField({
      name: 'discountType',
      title: 'Discount Type',
      type: 'string',
      options: {list: [
        {title: 'None', value: 'none'},
        {title: 'Percent %', value: 'percent'},
        {title: 'Amount $', value: 'amount'},
      ]},
      initialValue: 'none',
    }),
    defineField({name: 'discountValue', title: 'Discount Value', type: 'number'}),
    defineField({name: 'taxRate', title: 'Tax Rate %', type: 'number'}),
    defineField({name: 'taxAmount', title: 'Tax (auto)', type: 'number', readOnly: true}),
    defineField({name: 'total', title: 'Total (auto)', type: 'number', readOnly: true}),

    // Meta & lifecycle
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'status',
      title: 'Quote Status',
      type: 'string',
      components: {input: QuoteStatusWithTimeline},
    }),
    defineField({
      name: 'timeline',
      title: 'Quote Timeline',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'action', type: 'string', title: 'Action'},
            {name: 'timestamp', type: 'datetime', title: 'Timestamp'},
          ],
        },
      ],
    }),

    // Delivery (PDF + Email)
    defineField({
      name: 'quotePdfUrl',
      title: 'Generated Quote PDF (read-only)',
      type: 'url',
      readOnly: true,
    }),
    defineField({
      name: 'lastEmailedAt',
      title: 'Last Emailed At',
      type: 'datetime',
      readOnly: true,
    }),

    // Action hooks (render as buttons via Studio components if present)
    defineField({
      name: 'convertToInvoice',
      type: 'string',
      title: 'Convert to Invoice',
      components: {input: ConvertToInvoiceButton},
      description: 'Create an invoice from this quote.',
    }),
    defineField({
      name: 'emailQuoteAction',
      type: 'string',
      title: 'Email Quote to Customer',
      description: 'Triggers the sendQuoteEmail function to email this quote.',
      // Keep it simple: no custom component import to avoid build errors if not present.
      hidden: true,
    }),
    defineField({
      name: 'printDownloadQuoteAction',
      type: 'string',
      title: 'Download/Print Quote',
      description: 'Generates a PDF for download/print (wire to generateInvoicePDF-equivalent for quotes).',
      hidden: true,
    }),
  ],

  preview: {
    select: {
      title: 'title',
      quoteNumber: 'quoteNumber',
      customerName: 'customer.name',
      customerEmail: 'customer.email'
    },
    prepare(sel) {
      const title = (sel?.title && String(sel.title))
        || (sel?.quoteNumber ? `Quote #${sel.quoteNumber}` : 'Quote')

      const parts = [] as string[]
      if (sel?.quoteNumber) parts.push(`#${sel.quoteNumber}`)
      if (sel?.customerName) parts.push(String(sel.customerName))
      else if (sel?.customerEmail) parts.push(String(sel.customerEmail))

      return {
        title,
        subtitle: parts.join(' — ') || undefined,
      }
    }
  },
})