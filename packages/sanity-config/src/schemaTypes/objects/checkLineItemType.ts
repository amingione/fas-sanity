import {defineType, defineField} from 'sanity'

export const checkLineItemType = defineType({
  name: 'checkLineItem',
  title: 'Check Line Item',
  type: 'object',
  fields: [
    defineField({name: 'category', title: 'Category', type: 'string'}),
    defineField({name: 'description', title: 'Description', type: 'string'}),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      validation: (Rule) => Rule.min(0),
    }),
  ],
  preview: {
    select: {
      title: 'description',
      subtitle: 'category',
      amount: 'amount',
    },
    prepare({title, subtitle, amount}) {
      const label = title || subtitle || 'Line Item'
      const formatted = typeof amount === 'number' ? `$${amount.toFixed(2)}` : ''
      return {
        title: label,
        subtitle: [subtitle, formatted].filter(Boolean).join(' • '),
      }
    },
  },
})
