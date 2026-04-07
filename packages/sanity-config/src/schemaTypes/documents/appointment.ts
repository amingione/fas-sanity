import {defineField, defineType} from 'sanity'

const APPOINTMENT_STATUS_OPTIONS = [
  {title: 'Scheduled', value: 'scheduled'},
  {title: 'Confirmed', value: 'confirmed'},
  {title: 'In Progress', value: 'in_progress'},
  {title: 'Completed', value: 'completed'},
  {title: 'Cancelled', value: 'cancelled'},
  {title: 'No Show', value: 'no_show'},
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
  name: 'appointment',
  title: 'Appointments',
  type: 'document',
  fields: [
    defineField({
      name: 'appointmentNumber',
      title: 'Appointment Number',
      type: 'string',
      description: 'Auto-generated reference number.',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: APPOINTMENT_STATUS_OPTIONS},
      initialValue: 'scheduled',
    }),
    defineField({
      name: 'scheduledDate',
      title: 'Scheduled Date',
      type: 'datetime',
    }),
    defineField({
      name: 'bay',
      title: 'Service Bay',
      type: 'string',
      options: {list: BAY_OPTIONS},
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
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
      name: 'workOrder',
      title: 'Work Order',
      type: 'reference',
      to: [{type: 'workOrder'}],
    }),
    defineField({name: 'estimatedDuration', title: 'Estimated Duration (hours)', type: 'number'}),
    defineField({name: 'customerNotes', title: 'Customer Notes', type: 'text', rows: 3}),
    defineField({name: 'internalNotes', title: 'Internal Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      appointmentNumber: 'appointmentNumber',
      scheduledDate: 'scheduledDate',
      status: 'status',
      customerName: 'customer.name',
    },
    prepare(selection) {
      const title = selection.appointmentNumber || 'Appointment'
      const customer = selection.customerName ? ` · ${selection.customerName}` : ''
      const date = selection.scheduledDate
        ? ` · ${new Date(selection.scheduledDate as string).toLocaleDateString()}`
        : ''
      return {
        title,
        subtitle: `${selection.status || 'scheduled'}${customer}${date}`,
      }
    },
  },
})
