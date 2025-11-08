import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'freightQuote',
  title: 'Freight Quote',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', readOnly: true}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: ['open', 'quoted', 'scheduled', 'completed', 'cancelled'],
        layout: 'dropdown',
      },
      initialValue: 'open',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({name: 'orderRef', title: 'Order', type: 'reference', to: [{type: 'order'}]}),
    defineField({name: 'invoiceRef', title: 'Invoice', type: 'reference', to: [{type: 'invoice'}]}),
    defineField({
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({name: 'contactName', title: 'Contact Name', type: 'string'}),
    defineField({name: 'contactEmail', title: 'Contact Email', type: 'string'}),
    defineField({name: 'contactPhone', title: 'Contact Phone', type: 'string'}),
    defineField({name: 'destination', title: 'Destination', type: 'shippingAddress'}),
    defineField({name: 'cart', title: 'Cart Items', type: 'array', of: [{type: 'orderCartItem'}]}),
    defineField({
      name: 'packages',
      title: 'Packages',
      type: 'array',
      of: [{type: 'packageDetails'}],
    }),
    defineField({name: 'notes', title: 'Notes', type: 'text'}),
  ],
  preview: {
    select: {status: 'status', contact: 'contactName', createdAt: 'createdAt'},
    prepare(sel) {
      const title = `Freight Quote${sel.contact ? ' • ' + sel.contact : ''}`
      const subtitle = `${(sel.status || 'open').toUpperCase()} • ${sel.createdAt || ''}`
      return {title, subtitle}
    },
  },
})
