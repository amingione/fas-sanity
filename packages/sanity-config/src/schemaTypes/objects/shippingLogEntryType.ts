import { defineType, defineField } from 'sanity'

export const shippingLogEntryType = defineType({
  name: 'shippingLogEntry',
  title: 'Shipping Event',
  type: 'object',
  fields: [
    defineField({ name: 'status', type: 'string', title: 'Status' }),
    defineField({ name: 'message', type: 'text', title: 'Message' }),
    defineField({ name: 'labelUrl', type: 'url', title: 'Label URL' }),
    defineField({ name: 'trackingUrl', type: 'url', title: 'Tracking URL' }),
    defineField({ name: 'trackingNumber', type: 'string', title: 'Tracking Number' }),
    defineField({ name: 'weight', type: 'number', title: 'Weight (lbs)' }),
    defineField({ name: 'createdAt', type: 'datetime', title: 'Timestamp' }),
  ],
})

