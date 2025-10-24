import {defineField, defineType} from 'sanity'

export const orderEventType = defineType({
  name: 'orderEvent',
  title: 'Order Event',
  type: 'object',
  readOnly: true,
  fields: [
    defineField({name: 'type', title: 'Type', type: 'string', readOnly: true}),
    defineField({name: 'status', title: 'Status', type: 'string', readOnly: true}),
    defineField({name: 'label', title: 'Label', type: 'string', readOnly: true}),
    defineField({name: 'message', title: 'Message', type: 'text', rows: 3, readOnly: true}),
    defineField({name: 'amount', title: 'Amount', type: 'number', readOnly: true}),
    defineField({name: 'currency', title: 'Currency', type: 'string', readOnly: true}),
    defineField({name: 'stripeEventId', title: 'Stripe Event ID', type: 'string', readOnly: true}),
    defineField({name: 'metadata', title: 'Metadata', type: 'text', rows: 4, readOnly: true}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true}),
  ],
})
