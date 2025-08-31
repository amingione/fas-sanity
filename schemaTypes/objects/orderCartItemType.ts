import { defineType, defineField } from 'sanity'

export const orderCartItemType = defineType({
  name: 'orderCartItem',
  title: 'Cart Item',
  type: 'object',
  fields: [
    defineField({ name: 'id', type: 'string', title: 'Product ID' }),
    defineField({ name: 'sku', type: 'string', title: 'SKU' }),
    defineField({ name: 'name', type: 'string', title: 'Product Name' }),
    defineField({ name: 'price', type: 'number', title: 'Unit Price' }),
    defineField({ name: 'quantity', type: 'number', title: 'Quantity' }),
    defineField({ name: 'categories', title: 'Category Refs', type: 'array', of: [ { type: 'string' } ] }),
  ],
})
