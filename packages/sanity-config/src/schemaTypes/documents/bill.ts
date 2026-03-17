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
    defineField({
      name: 'invoiceRef',
      title: 'Invoice Reference',
      type: 'reference',
      to: [{type: 'invoice'}],
      weak: true,
    }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'string',
      options: {
        list: [
          {title: 'Check', value: 'check'},
          {title: 'ACH', value: 'ach'},
          {title: 'Wire', value: 'wire'},
          {title: 'Credit Card', value: 'credit_card'},
          {title: 'Net 30', value: 'net30'},
          {title: 'Net 60', value: 'net60'},
        ],
      },
    }),
    defineField({
      name: 'paymentReceipt',
      title: 'Payment Receipt',
      type: 'string',
      description: 'Receipt or check number',
    }),
    defineField({
      name: 'paidAt',
      title: 'Paid At',
      type: 'datetime',
    }),
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
