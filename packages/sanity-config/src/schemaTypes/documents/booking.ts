import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'booking',
  title: 'Booking',
  type: 'document',
  fields: [
    defineField({ name: 'bookingId', title: 'Booking ID', type: 'string' }),
    defineField({ name: 'customer', title: 'Customer', type: 'reference', to: [{ type: 'customer' }] }),
    defineField({ name: 'service', title: 'Service', type: 'string' }),
    defineField({ name: 'scheduledAt', title: 'Scheduled At', type: 'datetime' }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: ['confirmed', 'cancelled', 'rescheduled', 'no-show', 'snoozed', 'completed']},
    }),
    defineField({ name: 'notes', title: 'Notes', type: 'text' }),
    defineField({ name: 'createdAt', title: 'Created At', type: 'datetime', initialValue: () => new Date().toISOString() }),
  ]
});