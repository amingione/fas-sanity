import { defineType, defineField } from 'sanity'

export const quoteLineItemType = defineType({
  name: 'quoteLineItem',
  title: 'Line Item',
  type: 'object',
  fields: [
    defineField({ name: 'product', title: 'Product', type: 'reference', to: [{ type: 'product' }] }),
    defineField({ name: 'customName', title: 'Custom Item Name', type: 'string' }),
    defineField({ name: 'description', title: 'Description', type: 'text' }),
    defineField({ name: 'unitPrice', title: 'Unit Price (USD)', type: 'number' }),
    defineField({ name: 'quantity', title: 'Quantity', type: 'number', initialValue: 1 }),
    defineField({ name: 'lineTotal', title: 'Line Total (auto)', type: 'number', readOnly: true }),
  ],
  preview: {
    select: { name: 'customName', product: 'product.title', qty: 'quantity', price: 'unitPrice', total: 'lineTotal' },
    prepare({ name, product, qty, price, total }) {
      const title = product || name || 'Item'
      const subtitle = `${qty ?? 1} × $${price ?? 0} = $${total ?? 0}`
      return { title, subtitle }
    },
  },
})

