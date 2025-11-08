import {defineType, defineField} from 'sanity'
import InvoiceLineItemInput from '../../components/studio/InvoiceLineItemInput'

export const invoiceLineItemType = defineType({
  name: 'invoiceLineItem',
  title: 'Invoice Line Item',
  type: 'object',
  components: {input: InvoiceLineItemInput},
  fields: [
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      initialValue: 'product',
      options: {list: ['product', 'custom'], layout: 'radio'},
    }),
    defineField({name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
    defineField({name: 'description', title: 'Description', type: 'string'}),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({name: 'quantity', title: 'Qty', type: 'number'}),
    defineField({name: 'unitPrice', title: 'Unit Price', type: 'number'}),
    defineField({name: 'lineTotal', title: 'Line Total (override)', type: 'number'}),
  ],
  validation: (Rule) =>
    Rule.custom((val: any) => {
      if (!val) return 'Required'
      if (val.kind === 'product' && !val.product) return 'Choose a product or switch to Custom'
      if (val.kind === 'custom' && !val.description)
        return 'Description is required for custom items'
      return true
    }),
  preview: {
    select: {title: 'description', qty: 'quantity', price: 'unitPrice', kind: 'kind', sku: 'sku'},
    prepare({title, qty, price, kind, sku}: any) {
      const label = kind === 'product' ? title || 'Product' : title || 'Custom item'
      return {
        title: `${label}${sku ? ` • ${sku}` : ''} — ${qty || 1} × $${Number(price || 0).toFixed(2)}`,
      }
    },
  },
})
