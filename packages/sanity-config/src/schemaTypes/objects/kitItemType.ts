import { defineType, defineField } from 'sanity'

export const kitItemType = defineType({
  name: 'kitItem',
  title: 'Kit Item',
  type: 'object',
  fields: [
    defineField({ name: 'item', title: 'Item', type: 'string' }),
    defineField({ name: 'quantity', title: 'Quantity', type: 'string' }),
    defineField({ name: 'notes', title: 'Notes', type: 'text' }),
  ],
  preview: { select: { title: 'item', subtitle: 'quantity' } }
})

