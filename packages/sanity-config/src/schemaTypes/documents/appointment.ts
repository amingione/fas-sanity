import {defineField, defineType} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

export default defineType({
  name: 'appointment',
  title: 'Appointment',
  type: 'document',
  groups: [
    {name: 'schedule', title: 'Schedule', default: true},
    {name: 'details', title: 'Details'},
    {name: 'customer', title: 'Customer & Vehicle'},
  ],
  fields: [
    defineField({
      name: 'appointmentNumber',
      title: 'Appointment Number',
      type: 'string',
      readOnly: true,
      components: {input: ReferenceCodeInput},
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateReferenceCode(client, {
          prefix: 'APT-',
          typeName: 'appointment',
          fieldName: 'appointmentNumber',
        })
      },
      group: 'schedule',
    }),
    defineField({
      name: 'scheduledDate',
      title: 'Scheduled Date & Time',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      group: 'schedule',
    }),
    defineField({
      name: 'estimatedDuration',
      title: 'Estimated Duration (hours)',
      type: 'number',
      validation: (Rule) => Rule.min(0.5),
      group: 'schedule',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'Needs Confirmation', value: 'needs_confirmation'},
          {title: 'Confirmed', value: 'confirmed'},
          {title: 'In Progress', value: 'in_progress'},
          {title: 'Completed', value: 'completed'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
        layout: 'radio',
      },
      initialValue: 'scheduled',
      group: 'schedule',
    }),
    defineField({
      name: 'bay',
      title: 'Service Bay',
      type: 'string',
      options: {
        list: [
          {title: 'Bay 1', value: 'bay1'},
          {title: 'Bay 2', value: 'bay2'},
          {title: 'Bay 3', value: 'bay3'},
          {title: 'Bay 4', value: 'bay4'},
        ],
      },
      group: 'schedule',
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
      group: 'customer',
    }),
    defineField({
      name: 'vehicle',
      title: 'Vehicle',
      type: 'reference',
      to: [{type: 'vehicle'}],
      group: 'customer',
    }),
    defineField({
      name: 'service',
      title: 'Service',
      type: 'reference',
      to: [{type: 'service'}],
      validation: (Rule) => Rule.required(),
      group: 'details',
    }),
    defineField({
      name: 'notes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
      group: 'details',
    }),
    defineField({
      name: 'customerNotes',
      title: 'Customer Notes',
      type: 'text',
      rows: 3,
      group: 'details',
    }),
    defineField({
      name: 'workOrder',
      title: 'Work Order',
      type: 'reference',
      to: [{type: 'workOrder'}],
      group: 'details',
    }),
  ],
  preview: {
    select: {
      title: 'appointmentNumber',
      scheduledDate: 'scheduledDate',
      customerName: 'customer.firstName',
      customerLast: 'customer.lastName',
      service: 'service.title',
    },
    prepare({title, scheduledDate, customerName, customerLast, service}) {
      const when = scheduledDate ? new Date(scheduledDate).toLocaleString() : 'Unsheduled'
      const customer = [customerName, customerLast].filter(Boolean).join(' ') || 'No customer'
      return {
        title: `${title || 'Appointment'} • ${customer}`,
        subtitle: [when, service].filter(Boolean).join(' • '),
      }
    },
  },
})
