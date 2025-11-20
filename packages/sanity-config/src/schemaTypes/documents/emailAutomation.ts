import {RobotIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'emailAutomation',
  title: 'Email Automation',
  type: 'document',
  icon: RobotIcon,
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'active',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'trigger',
      type: 'string',
      options: {
        list: [
          {title: 'Order Placed', value: 'order_placed'},
          {title: 'Order Shipped', value: 'order_shipped'},
          {title: 'Order Delivered', value: 'order_delivered'},
          {title: 'Appointment Booked', value: 'appointment_booked'},
          {title: 'Appointment Reminder (24hrs)', value: 'appointment_reminder'},
          {title: 'Work Order Completed', value: 'work_order_completed'},
          {title: 'Invoice Sent', value: 'invoice_sent'},
          {title: 'Payment Received', value: 'payment_received'},
          {title: 'Cart Abandoned (1hr)', value: 'cart_abandoned_1hr'},
          {title: 'Cart Abandoned (24hrs)', value: 'cart_abandoned_24hr'},
          {title: 'No Order in 90 Days', value: 'no_order_90days'},
          {title: 'Review Request (7 days after delivery)', value: 'review_request'},
          {title: 'Service Reminder (6 months)', value: 'service_reminder'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'delay',
      title: 'Delay (minutes)',
      type: 'number',
      description: 'Wait this long after trigger',
    }),
    defineField({
      name: 'template',
      type: 'reference',
      to: [{type: 'emailTemplate'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conditions',
      type: 'array',
      of: [
        defineField({
          name: 'condition',
          title: 'Condition',
          type: 'object',
          fields: [
            defineField({
              name: 'field',
              type: 'string',
              description: 'e.g., orderType, customerSegment',
            }),
            defineField({
              name: 'operator',
              type: 'string',
              options: {
                list: [
                  {title: 'Equals', value: 'equals'},
                  {title: 'Not Equals', value: 'not_equals'},
                  {title: 'Greater Than', value: 'greater_than'},
                  {title: 'Less Than', value: 'less_than'},
                  {title: 'Contains', value: 'contains'},
                ],
              },
            }),
            defineField({
              name: 'value',
              type: 'string',
            }),
          ],
        }),
      ],
      description: 'Only send if conditions match',
    }),
    defineField({
      name: 'sentCount',
      type: 'number',
      title: 'Sent Count',
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: 'openRate',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'clickRate',
      type: 'number',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      trigger: 'trigger',
      active: 'active',
    },
    prepare({title, trigger, active}) {
      return {
        title,
        subtitle: [trigger, active === false ? 'Paused' : 'Active'].filter(Boolean).join(' • '),
      }
    },
  },
})
