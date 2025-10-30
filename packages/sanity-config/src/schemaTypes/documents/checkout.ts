import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'checkout',
  title: 'Checkout',
  type: 'document',
  fields: [
    defineField({name: 'status', title: 'Status', type: 'string', readOnly: true}),
    defineField({name: 'paymentStatus', title: 'Payment Status', type: 'string', readOnly: true}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true}),
    defineField({name: 'abandonedAt', title: 'Abandoned At', type: 'datetime', readOnly: true}),
    defineField({name: 'expiresAt', title: 'Expires At', type: 'datetime', readOnly: true}),
    defineField({name: 'customerEmail', title: 'Customer Email', type: 'string', readOnly: true}),
    defineField({name: 'customerFirstName', title: 'Customer First Name', type: 'string', readOnly: true}),
    defineField({name: 'customerLastName', title: 'Customer Last Name', type: 'string', readOnly: true}),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      readOnly: true,
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [{type: 'orderCartItem'}],
      readOnly: true,
    }),
    defineField({
      name: 'totalAmount',
      title: 'Checkout Total',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'shippingAmount',
      title: 'Shipping Amount',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'shippingSelection',
      title: 'Shipping Selection',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({name: 'service', title: 'Service', type: 'string', readOnly: true}),
        defineField({name: 'amount', title: 'Amount', type: 'number', readOnly: true}),
      ],
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
    }),
    defineField({
      name: 'systemTags',
      title: 'System Tags',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
    }),
    defineField({
      name: 'recoveredOrder',
      title: 'Recovered Order',
      type: 'reference',
      to: [{type: 'order'}],
      readOnly: true,
    }),
    defineField({name: 'note', title: 'Internal Notes', type: 'text'}),
  ],
  preview: {
    select: {
      email: 'customerEmail',
      status: 'status',
      total: 'totalAmount',
    },
    prepare({email, status, total}) {
      const parts = [status || 'checkout', email || 'unknown']
      const amount = typeof total === 'number' ? `$${total.toFixed(2)}` : null
      if (amount) parts.push(amount)
      return {
        title: email || 'Checkout',
        subtitle: parts.filter(Boolean).join(' • '),
      }
    },
  },
})
