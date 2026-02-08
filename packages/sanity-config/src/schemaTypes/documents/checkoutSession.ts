import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'checkoutSession',
  title: 'Checkout Session',
  type: 'document',
  fields: [
    defineField({name: 'sessionId', type: 'string', title: 'Session ID'}),
    defineField({name: 'customerEmail', type: 'string', title: 'Customer Email'}),
    defineField({name: 'customerRef', type: 'reference', to: [{type: 'customer'}]}),
    defineField({name: 'status', type: 'string', title: 'Status'}),
    defineField({name: 'cartSummary', type: 'string', title: 'Cart Summary'}),
    defineField({name: 'amountTotal', type: 'number', title: 'Total Amount'}),
    defineField({name: 'shippingCost', type: 'number', title: 'Shipping Cost'}),
    defineField({name: 'sessionCreatedAt', type: 'datetime', title: 'Session Created At'}),
    defineField({name: 'sessionExpiredAt', type: 'datetime', title: 'Session Expired At'}),
  ],
  preview: {
    select: {
      title: 'sessionId',
      subtitle: 'status',
    },
  },
})
