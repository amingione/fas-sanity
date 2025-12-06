import {defineField, defineType} from 'sanity'

export const orderEventType = defineType({
  name: 'orderEvent',
  title: 'Order Event',
  type: 'object',
  readOnly: false,
  fields: [
    defineField({name: 'type', title: 'Type', type: 'string', readOnly: false}),
    defineField({name: 'status', title: 'Status', type: 'string', readOnly: false}),
    defineField({name: 'label', title: 'Label', type: 'string', readOnly: false}),
    defineField({name: 'message', title: 'Message', type: 'text', rows: 3, readOnly: false}),
    defineField({name: 'amount', title: 'Amount', type: 'number', readOnly: false}),
    defineField({name: 'currency', title: 'Currency', type: 'string', readOnly: false}),
    defineField({name: 'stripeEventId', title: 'Stripe Event ID', type: 'string', readOnly: false}),
    defineField({name: 'metadata', title: 'Metadata', type: 'text', rows: 4, readOnly: false}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: false}),
  ],
})
