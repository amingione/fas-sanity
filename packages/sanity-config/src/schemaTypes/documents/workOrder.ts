import {defineField, defineType} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

export default defineType({
  name: 'workOrder',
  title: 'Work Order',
  type: 'document',
  groups: [
    {name: 'timeline', title: 'Timeline', default: true},
    {name: 'scope', title: 'Scope & Labor'},
    {name: 'parts', title: 'Parts & Charges'},
    {name: 'photos', title: 'Photos'},
  ],
  fields: [
    defineField({
      name: 'workOrderNumber',
      title: 'Work Order Number',
      type: 'string',
      readOnly: true,
      components: {input: ReferenceCodeInput},
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateReferenceCode(client, {
          prefix: 'WO-',
          typeName: 'workOrder',
          fieldName: 'workOrderNumber',
        })
      },
      group: 'timeline',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Not Started', value: 'not_started'},
          {title: 'In Progress', value: 'in_progress'},
          {title: 'Waiting for Parts', value: 'waiting_parts'},
          {title: 'Waiting for Approval', value: 'waiting_approval'},
          {title: 'Completed', value: 'completed'},
        ],
      },
      initialValue: 'not_started',
      group: 'timeline',
    }),
    defineField({
      name: 'appointment',
      title: 'Appointment',
      type: 'reference',
      to: [{type: 'appointment'}],
      group: 'timeline',
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
      group: 'scope',
    }),
    defineField({
      name: 'vehicle',
      title: 'Vehicle',
      type: 'reference',
      to: [{type: 'vehicle'}],
      group: 'scope',
    }),
    defineField({
      name: 'service',
      title: 'Service',
      type: 'reference',
      to: [{type: 'service'}],
      group: 'scope',
    }),
    defineField({
      name: 'bay',
      title: 'Assigned Bay',
      type: 'string',
      options: {
        list: [
          {title: 'Bay 1', value: 'bay1'},
          {title: 'Bay 2', value: 'bay2'},
          {title: 'Bay 3', value: 'bay3'},
          {title: 'Bay 4', value: 'bay4'},
        ],
      },
      group: 'scope',
    }),
    defineField({
      name: 'startedAt',
      title: 'Started At',
      type: 'datetime',
      group: 'timeline',
    }),
    defineField({
      name: 'completedAt',
      title: 'Completed At',
      type: 'datetime',
      group: 'timeline',
    }),
    defineField({
      name: 'laborHours',
      title: 'Labor Hours',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      group: 'scope',
    }),
    defineField({
      name: 'laborRate',
      title: 'Labor Rate (USD/hr)',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      group: 'scope',
    }),
    defineField({
      name: 'partsUsed',
      title: 'Parts Used',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'part',
              title: 'Part',
              type: 'reference',
              to: [{type: 'product'}],
            }),
            defineField({
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
              initialValue: 1,
              validation: (Rule) => Rule.min(1),
            }),
            defineField({
              name: 'price',
              title: 'Line Price (USD)',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
          ],
        },
      ],
      group: 'parts',
    }),
    defineField({
      name: 'additionalCharges',
      title: 'Additional Charges',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'description', title: 'Description', type: 'string'}),
            defineField({
              name: 'amount',
              title: 'Amount (USD)',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
          ],
        },
      ],
      group: 'parts',
    }),
    defineField({
      name: 'technicianNotes',
      title: 'Technician Notes',
      type: 'text',
      rows: 3,
      group: 'scope',
    }),
    defineField({
      name: 'customerNotes',
      title: 'Customer Notes',
      type: 'text',
      rows: 3,
      group: 'scope',
    }),
    defineField({
      name: 'photos',
      title: 'Before / After Photos',
      type: 'array',
      of: [{type: 'image'}],
      options: {layout: 'grid'},
      group: 'photos',
    }),
    defineField({
      name: 'invoice',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
      group: 'parts',
    }),
  ],
  preview: {
    select: {
      title: 'workOrderNumber',
      status: 'status',
      customerName: 'customer.firstName',
      customerLast: 'customer.lastName',
      vehicle: 'vehicle',
    },
    prepare({title, status, customerName, customerLast}) {
      const customer = [customerName, customerLast].filter(Boolean).join(' ') || 'No customer'
      return {
        title: `${title || 'Work Order'} • ${customer}`,
        subtitle: status ? status.replace(/_/g, ' ') : '',
      }
    },
  },
})
