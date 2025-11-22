import {defineType, defineField} from 'sanity'

export const invoiceLineItemType = defineType({
  name: 'invoiceLineItem',
  title: 'Invoice Line Item',
  type: 'object',
  fields: [
    defineField({name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      initialValue: 1,
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'unitPrice',
      title: 'Unit Price',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'lineTotal',
      title: 'Line Total',
      description: 'Auto-calculated: quantity × unitPrice',
      type: 'number',
      readOnly: true,
    }),
  ],
  preview: {
    select: {title: 'description', qty: 'quantity', price: 'unitPrice', sku: 'sku'},
    prepare({title, qty, price, sku}: any) {
      const label = title || 'Line item'
      return {
        title: `${label}${sku ? ` • ${sku}` : ''} — ${qty || 1} × $${Number(price || 0).toFixed(
          2,
        )}`,
      }
    },
  },
})
