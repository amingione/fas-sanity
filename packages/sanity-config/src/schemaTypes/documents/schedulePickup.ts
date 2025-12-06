import {defineField, defineType} from 'sanity'
import {CalendarIcon} from '@sanity/icons'

export default defineType({
  name: 'schedulePickup',
  title: 'Schedule Pickup',
  type: 'document',
  icon: CalendarIcon,
  fields: [
    defineField({
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
      options: {
        list: [
          {title: 'UPS', value: 'UPS'},
          {title: 'USPS', value: 'USPS'},
          {title: 'FedEx', value: 'FedEx'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'reference',
      title: 'Related Shipment IDs',
      type: 'array',
      of: [{type: 'string'}],
      description: 'EasyPost shipment IDs to include in pickup request.',
    }),
    defineField({
      name: 'pickupAddress',
      title: 'Pickup Address',
      type: 'reference',
      to: [{type: 'senderAddress'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pickupWindowStart',
      title: 'Pickup Window Start',
      type: 'datetime',
      validation: (Rule) => Rule.required().min(new Date().toISOString()),
    }),
    defineField({
      name: 'pickupWindowEnd',
      title: 'Pickup Window End',
      type: 'datetime',
      validation: (Rule) => Rule.required().min(Rule.valueOfField('pickupWindowStart')),
    }),
  ],
})
