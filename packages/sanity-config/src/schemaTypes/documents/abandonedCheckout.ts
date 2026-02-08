import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'abandonedCheckout',
  title: 'Abandoned Checkout',
  type: 'document',
  fields: [
    defineField({name: 'customerEmail', type: 'string', title: 'Customer Email'}),
    defineField({name: 'customerName', type: 'string', title: 'Customer Name'}),
    defineField({name: 'customerRef', type: 'reference', to: [{type: 'customer'}]}),
    defineField({name: 'status', type: 'string', title: 'Status'}),
    defineField({name: 'cartSummary', type: 'string', title: 'Cart Summary'}),
    defineField({name: 'amountTotal', type: 'number', title: 'Total Amount'}),
    defineField({name: 'shippingCost', type: 'number', title: 'Shipping Cost'}),
    defineField({name: 'recoveryEmailSent', type: 'boolean', title: 'Recovery Email Sent'}),
    defineField({name: 'recoveryEmailSentAt', type: 'datetime', title: 'Recovery Email Sent At'}),
    defineField({name: 'sessionCreatedAt', type: 'datetime', title: 'Session Created At'}),
    defineField({name: 'sessionExpiredAt', type: 'datetime', title: 'Session Expired At'}),
  ],
  preview: {
    select: {
      title: 'customerEmail',
      subtitle: 'status',
    },
  },
})
