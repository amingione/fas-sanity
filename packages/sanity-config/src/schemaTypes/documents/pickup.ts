import {defineField, defineType} from 'sanity'
import {TrolleyIcon} from '@sanity/icons'

export default defineType({
  name: 'pickup',
  title: 'Pickups',
  type: 'document',
  icon: TrolleyIcon,
  fields: [
    defineField({
      name: 'easypostId',
      title: 'EasyPost Pickup ID',
      type: 'string',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'In Progress', value: 'in_progress'},
          {title: 'Completed', value: 'completed'},
          {title: 'Canceled', value: 'canceled'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'confirmation',
      title: 'Confirmation Number',
      type: 'string',
    }),
    defineField({
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'reference',
      title: 'Reference Label IDs',
      type: 'array',
      of: [{type: 'string'}],
      description: 'EasyPost shipment IDs included in this pickup',
    }),
    defineField({
      name: 'pickupWindowStart',
      title: 'Pickup Window Start',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pickupWindowEnd',
      title: 'Pickup Window End',
      type: 'datetime',
      validation: (Rule) => Rule.required().min(Rule.valueOfField('pickupWindowStart')),
    }),
    defineField({
      name: 'pickupAddress',
      title: 'Pickup Address',
      type: 'reference',
      to: [{type: 'senderAddress'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'details',
      title: 'Full EasyPost Payload',
      type: 'text',
    }),
  ],
  preview: {
    select: {
      title: 'carrier',
      subtitle: 'confirmation',
      date: 'pickupWindowStart',
      status: 'status',
    },
    prepare({title, subtitle, date, status}) {
      return {
        title: title ? `${title} Pickup` : 'Pickup',
        subtitle: date
          ? `${subtitle ?? ''} - ${new Date(date).toLocaleDateString()} (${status ?? ''})`
          : subtitle ?? '',
      }
    },
  },
})
