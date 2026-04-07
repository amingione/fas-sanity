import {defineField, defineType} from 'sanity'

const WORK_ORDER_STATUS_OPTIONS = [
  {title: 'Queued', value: 'queued'},
  {title: 'In Progress', value: 'in_progress'},
  {title: 'On Hold', value: 'on_hold'},
  {title: 'Completed', value: 'completed'},
  {title: 'Cancelled', value: 'cancelled'},
]

const BAY_OPTIONS = [
  {title: 'Bay 1', value: 'bay_1'},
  {title: 'Bay 2', value: 'bay_2'},
  {title: 'Bay 3', value: 'bay_3'},
  {title: 'Bay 4', value: 'bay_4'},
  {title: 'Dyno', value: 'dyno'},
  {title: 'Detail', value: 'detail'},
]

export default defineType({
  name: 'workOrder',
  title: 'Work Orders',
  type: 'document',
  fields: [
    defineField({
      name: 'workOrderNumber',
      title: 'Work Order Number',
      type: 'string',
      description: 'Auto-generated (WO-XXXXXX). Do not edit manually.',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: WORK_ORDER_STATUS_OPTIONS},
      initialValue: 'queued',
    }),
    defineField({
      name: 'bay',
      title: 'Service Bay',
      type: 'string',
      options: {list: BAY_OPTIONS},
    }),
    defineField({name: 'startedAt', title: 'Started At', type: 'datetime'}),
    defineField({name: 'completedAt', title: 'Completed At', type: 'datetime'}),
    defineField({name: 'laborHours', title: 'Labor Hours', type: 'number'}),
    defineField({name: 'laborRate', title: 'Labor Rate ($/hr)', type: 'number'}),
    defineField({name: 'technicianNotes', title: 'Technician Notes', type: 'text', rows: 4}),
    defineField({name: 'customerNotes', title: 'Customer Notes', type: 'text', rows: 3}),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({
      name: 'appointment',
      title: 'Appointment',
      type: 'reference',
      to: [{type: 'appointment'}],
    }),
    defineField({
      name: 'vehicle',
      title: 'Vehicle',
      type: 'reference',
      weak: true,
      to: [{type: 'vehicle'}],
    }),
    defineField({
      name: 'service',
      title: 'Service',
      type: 'reference',
      weak: true,
      to: [{type: 'service'}],
    }),
    defineField({
      name: 'invoice',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
    }),
    defineField({
      name: 'partsUsed',
      title: 'Parts Used',
      type: 'array',
      of: [
        defineField({
          name: 'partLineItem',
          title: 'Part',
          type: 'object',
          fields: [
            defineField({
              name: 'part',
              title: 'Product / Part',
              type: 'reference',
              to: [{type: 'product'}],
            }),
            defineField({name: 'quantity', title: 'Quantity', type: 'number', initialValue: 1}),
            defineField({name: 'price', title: 'Unit Price', type: 'number'}),
          ],
        }),
      ],
    }),
    defineField({
      name: 'additionalCharges',
      title: 'Additional Charges',
      type: 'array',
      of: [
        defineField({
          name: 'additionalCharge',
          title: 'Charge',
          type: 'object',
          fields: [
            defineField({name: 'description', title: 'Description', type: 'string'}),
            defineField({name: 'amount', title: 'Amount', type: 'number'}),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: {
      workOrderNumber: 'workOrderNumber',
      status: 'status',
      customerName: 'customer.name',
    },
    prepare(selection) {
      const title = selection.workOrderNumber || 'Work Order'
      const customer = selection.customerName ? ` · ${selection.customerName}` : ''
      return {
        title,
        subtitle: `${selection.status || 'queued'}${customer}`,
      }
    },
  },
})
