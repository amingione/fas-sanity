import {defineField, defineType} from 'sanity'

import QuoteLineItemInput from '../../components/studio/QuoteLineItemInput'

export const quoteLineItemType = defineType({
  name: 'quoteLineItem',
  title: 'Quote Line Item',
  type: 'object',
  components: {input: QuoteLineItemInput},
  fields: [
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {list: ['product', 'custom'], layout: 'radio'},
      initialValue: 'product'
    }),
    defineField({name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
    defineField({name: 'customName', title: 'Item Name', type: 'string'}),
    defineField({name: 'description', title: 'Description', type: 'string'}),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({name: 'unitPrice', title: 'Unit Price (USD)', type: 'number'}),
    defineField({name: 'quantity', title: 'Quantity', type: 'number', initialValue: 1}),
    defineField({name: 'lineTotal', title: 'Line Total (override)', type: 'number'})
  ],
  validation: (Rule) =>
    Rule.custom((value: any) => {
      if (!value) return 'Line item is required'
      if (value.kind === 'product' && !value.product) return 'Pick a product or switch to Custom'
      if (value.kind === 'custom' && !value.customName) return 'Provide a name for custom items'
      return true
    }),
  preview: {
    select: {name: 'customName', product: 'product.title', qty: 'quantity', price: 'unitPrice', kind: 'kind'},
    prepare({name, product, qty, price, kind}) {
      const label = kind === 'product' ? product || name || 'Product' : name || 'Custom item'
      const quantity = Number(qty || 1)
      const amount = Number(price || 0)
      return {
        title: `${label} — ${quantity} × $${amount.toFixed(2)}`
      }
    }
  }
})
