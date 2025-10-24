import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'abandonedCheckout',
  title: 'Abandoned Checkout',
  type: 'document',
  fields: [
    defineField({name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string', readOnly: true}),
    defineField({name: 'clientReferenceId', title: 'Client Reference ID', type: 'string', readOnly: true}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Abandoned', value: 'abandoned'},
          {title: 'Recovered', value: 'recovered'},
          {title: 'Ignored', value: 'ignored'},
        ],
        layout: 'radio',
      },
      initialValue: 'abandoned',
    }),
    defineField({name: 'paymentStatus', title: 'Payment Status', type: 'string', readOnly: true}),
    defineField({name: 'customerEmail', title: 'Customer Email', type: 'string'}),
    defineField({name: 'customerName', title: 'Customer Name', type: 'string'}),
    defineField({name: 'stripeCustomerId', title: 'Stripe Customer ID', type: 'string', readOnly: true}),
    defineField({name: 'totalAmount', title: 'Checkout Total', type: 'number', readOnly: true}),
    defineField({name: 'currency', title: 'Currency', type: 'string', readOnly: true}),
    defineField({name: 'cart', title: 'Cart Snapshot', type: 'array', of: [{type: 'orderCartItem'}], readOnly: true}),
    defineField({name: 'metadata', title: 'Metadata', type: 'array', of: [{type: 'stripeMetadataEntry'}], readOnly: true}),
    defineField({name: 'shippingAddress', title: 'Shipping Address', type: 'shippingAddress', readOnly: true}),
    defineField({name: 'stripeSummary', title: 'Stripe Snapshot', type: 'stripeOrderSummary', readOnly: true}),
    defineField({
      name: 'events',
      title: 'Event Log',
      type: 'array',
      of: [{type: 'orderEvent'}],
      readOnly: true,
      options: {layout: 'grid'},
    }),
    defineField({name: 'orderRef', title: 'Recovered Order', type: 'reference', to: [{type: 'order'}]}),
    defineField({name: 'note', title: 'Internal Notes', type: 'text'}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true}),
    defineField({name: 'expiredAt', title: 'Expired At', type: 'datetime', readOnly: true}),
    defineField({name: 'recoveredAt', title: 'Recovered At', type: 'datetime', readOnly: true}),
  ],
  preview: {
    select: {
      sessionId: 'stripeSessionId',
      email: 'customerEmail',
      status: 'status',
      total: 'totalAmount',
      currency: 'currency',
    },
    prepare({sessionId, email, status, total, currency}) {
      const ref = sessionId ? `Session ${sessionId.slice(-6)}` : 'Abandoned Checkout'
      const subtitleParts = [status || 'abandoned', email || 'unknown', total ? `${currency || 'USD'} ${total.toFixed(2)}` : null]
      return {
        title: ref,
        subtitle: subtitleParts.filter(Boolean).join(' • '),
      }
    },
  },
})
