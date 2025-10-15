import {defineType, defineField} from 'sanity'

export const checkType = defineType({
  name: 'check',
  title: 'Check',
  type: 'document',
  fields: [
    defineField({
      name: 'payee',
      title: 'Payee',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mailingAddress',
      title: 'Mailing Address',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'bankAccount',
      title: 'Bank Account',
      type: 'reference',
      to: [{type: 'bankAccount'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      validation: (Rule) => Rule.required().min(0.01),
    }),
    defineField({
      name: 'memo',
      title: 'Memo',
      type: 'string',
    }),
    defineField({
      name: 'checkNumber',
      title: 'Check Number',
      type: 'number',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'paymentDate',
      title: 'Payment Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString().slice(0, 10),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Ready', value: 'ready'},
          {title: 'Printed', value: 'printed'},
          {title: 'Void', value: 'void'},
        ],
      },
      initialValue: 'draft',
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [{type: 'checkLineItem'}],
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [{type: 'file'}],
    }),
  ],
  preview: {
    select: {
      title: 'payee',
      amount: 'amount',
      number: 'checkNumber',
      date: 'paymentDate',
      status: 'status',
    },
    prepare({title, amount, number, date, status}) {
      const formattedAmount = typeof amount === 'number' ? `$${amount.toFixed(2)}` : ''
      const checkNo = number ? `#${number}` : ''
      const subtitleParts = [formattedAmount, checkNo, date, status && status.toUpperCase()].filter(Boolean)
      return {
        title: title || 'Check',
        subtitle: subtitleParts.join(' • '),
      }
    },
  },
})
