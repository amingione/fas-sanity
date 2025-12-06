import {defineField, defineType} from 'sanity'
import {RocketIcon} from '@sanity/icons'

export default defineType({
  name: 'shipment',
  title: 'Shipments',
  type: 'document',
  icon: RocketIcon,
  fields: [
    defineField({
      name: 'easypostId',
      title: 'EasyPost Shipment ID',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pre-Transit', value: 'pre_transit'},
          {title: 'In Transit', value: 'in_transit'},
          {title: 'Out for Delivery', value: 'out_for_delivery'},
          {title: 'Delivered', value: 'delivered'},
          {title: 'Returned', value: 'returned'},
          {title: 'Failure', value: 'failure'},
        ],
      },
    }),
    defineField({
      name: 'trackingCode',
      title: 'Tracking Code',
      type: 'string',
    }),
    defineField({
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
    }),
    defineField({
      name: 'service',
      title: 'Service Level',
      type: 'string',
    }),
    defineField({
      name: 'rate',
      title: 'Rate (USD)',
      type: 'number',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'transitDays',
      title: 'Transit Days',
      type: 'number',
    }),
    defineField({
      name: 'recipient',
      title: 'Recipient Name',
      type: 'string',
    }),
    defineField({
      name: 'labelUrl',
      title: 'Label URL',
      type: 'url',
    }),
    defineField({
      name: 'details',
      title: 'Full EasyPost Payload',
      type: 'text',
      description: 'Complete JSON response from EasyPost API',
    }),
  ],
  preview: {
    select: {
      title: 'recipient',
      subtitle: 'trackingCode',
      createdAt: 'createdAt',
      carrier: 'carrier',
    },
    prepare({title, subtitle, createdAt, carrier}) {
      return {
        title: `${title ?? 'Shipment'} - ${createdAt ? new Date(createdAt).toLocaleDateString() : ''}`,
        subtitle: `${carrier ?? ''} ${subtitle ?? ''}`.trim(),
      }
    },
  },
})
