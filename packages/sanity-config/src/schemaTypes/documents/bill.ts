import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'bill',
  title: 'Vendor Bills',
  type: 'document',
  fields: [
    defineField({name: 'description', title: 'Description', type: 'string'}),
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({name: 'amount', title: 'Amount', type: 'number'}),
    defineField({name: 'dueDate', title: 'Due Date', type: 'date'}),
    defineField({name: 'paid', title: 'Paid', type: 'boolean', initialValue: false}),
    defineField({name: 'paidDate', title: 'Paid Date', type: 'date'}),
    defineField({name: 'checkNumber', title: 'Check Number', type: 'string'}),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      title: 'description',
      vendor: 'vendor.companyName',
      amount: 'amount',
      paid: 'paid',
    },
    prepare(selection) {
      const title = selection.title || 'Bill'
      const vendor = selection.vendor ? ` · ${selection.vendor}` : ''
      const amount = typeof selection.amount === 'number' ? ` · $${selection.amount.toFixed(2)}` : ''
      const paid = selection.paid ? 'paid' : 'unpaid'
      return {title, subtitle: `${paid}${vendor}${amount}`}
    },
  },
})
