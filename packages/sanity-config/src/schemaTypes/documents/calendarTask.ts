import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'calendarTask',
  title: 'Calendar Task',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required().max(120),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'In progress', value: 'in-progress'},
          {title: 'Completed', value: 'completed'},
        ],
        layout: 'radio',
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'booking',
      title: 'Booking',
      type: 'reference',
      to: [{type: 'booking'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'assignedTo',
      title: 'Assigned to',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({name: 'dueAt', title: 'Due at', type: 'datetime'}),
    defineField({name: 'remindAt', title: 'Remind at', type: 'datetime'}),
    defineField({name: 'notes', title: 'Notes', type: 'text'}),
  ],
  preview: {
    select: {
      title: 'title',
      status: 'status',
      bookingId: 'booking._ref',
      dueAt: 'dueAt',
    },
    prepare({title, status, bookingId, dueAt}) {
      return {
        title: title || 'Calendar task',
        subtitle: [status, bookingId, dueAt ? new Date(dueAt).toLocaleString() : null]
          .filter(Boolean)
          .join(' · '),
      }
    },
  },
})
