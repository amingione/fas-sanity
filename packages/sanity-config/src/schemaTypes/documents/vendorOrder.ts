import {defineField, defineType} from 'sanity'

const ORDER_STATUS_OPTIONS = [
  {title: 'Pending', value: 'pending'},
  {title: 'Processing', value: 'processing'},
  {title: 'Partially Fulfilled', value: 'partially_fulfilled'},
  {title: 'Fulfilled', value: 'fulfilled'},
  {title: 'Cancelled', value: 'cancelled'},
]

export default defineType({
  name: 'vendorOrder',
  title: 'Vendor Orders',
  type: 'document',
  fields: [
    defineField({name: 'orderNumber', title: 'Order Number', type: 'string'}),
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: ORDER_STATUS_OPTIONS},
      initialValue: 'pending',
    }),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime'}),
    defineField({name: 'currency', title: 'Currency', type: 'string', initialValue: 'USD'}),
    defineField({name: 'amountSubtotal', title: 'Subtotal', type: 'number'}),
    defineField({name: 'amountTax', title: 'Tax', type: 'number'}),
    defineField({name: 'amountShipping', title: 'Shipping', type: 'number'}),
    defineField({name: 'totalAmount', title: 'Total Amount', type: 'number'}),
    defineField({
      name: 'cart',
      title: 'Cart',
      type: 'array',
      of: [
        defineField({
          name: 'cartItem',
          title: 'Cart Item',
          type: 'object',
          fields: [
            defineField({name: 'productRef', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({name: 'sku', title: 'SKU', type: 'string'}),
            defineField({name: 'quantity', title: 'Quantity', type: 'number'}),
            defineField({name: 'price', title: 'Unit Price', type: 'number'}),
            defineField({name: 'total', title: 'Line Total', type: 'number'}),
          ],
        }),
      ],
    }),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      title: 'orderNumber',
      subtitle: 'status',
      company: 'vendor.companyName',
      total: 'totalAmount',
    },
    prepare(selection) {
      const title = selection.title || 'Vendor Order'
      const status = selection.subtitle || 'status'
      const company = selection.company ? ` · ${selection.company}` : ''
      const total = typeof selection.total === 'number' ? ` · $${selection.total.toFixed(2)}` : ''
      return {title, subtitle: `${status}${company}${total}`}
    },
  },
})
