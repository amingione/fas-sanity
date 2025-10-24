import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'expense',
  title: 'Expense',
  type: 'document',
  fields: [
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date'
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number'
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string'
    }),
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{ type: 'vendor' }]
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text'
    })
  ]
})
