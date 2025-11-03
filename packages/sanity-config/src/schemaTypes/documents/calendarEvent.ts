import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'calendarEvent',
  title: 'Calendar Event',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required().max(120),
    }),
    defineField({
      name: 'startAt',
      title: 'Start',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'endAt',
      title: 'End',
      type: 'datetime',
      description: 'Optional. Leave blank for all-day or single-point events.',
    }),
    defineField({
      name: 'allDay',
      title: 'All-day event',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'location',
      title: 'Location',
      type: 'string',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'color',
      title: 'Label color',
      type: 'string',
      options: {
        list: [
          {title: 'Default', value: 'default'},
          {title: 'Blue', value: 'blue'},
          {title: 'Green', value: 'green'},
          {title: 'Orange', value: 'orange'},
          {title: 'Pink', value: 'pink'},
          {title: 'Purple', value: 'purple'},
          {title: 'Red', value: 'red'},
        ],
        layout: 'radio',
      },
      initialValue: 'default',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      startAt: 'startAt',
      endAt: 'endAt',
      allDay: 'allDay',
    },
    prepare(selection) {
      const {title, startAt, endAt, allDay} = selection
      if (!startAt) {
        return {
          title: title || 'Untitled event',
          subtitle: 'Missing start time',
        }
      }

      const start = new Date(startAt)
      const end = endAt ? new Date(endAt) : null
      const dateFormatter = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      })
      const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })

      const dateLabel = dateFormatter.format(start)
      const timeLabel = allDay
        ? 'All day'
        : end
          ? `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
          : timeFormatter.format(start)

      return {
        title: title || 'Untitled event',
        subtitle: `${dateLabel} • ${timeLabel}`,
      }
    },
  },
  orderings: [
    {
      title: 'Start time, newest first',
      name: 'startDesc',
      by: [
        {field: 'startAt', direction: 'desc'},
        {field: 'title', direction: 'asc'},
      ],
    },
    {
      title: 'Start time, oldest first',
      name: 'startAsc',
      by: [
        {field: 'startAt', direction: 'asc'},
        {field: 'title', direction: 'asc'},
      ],
    },
  ],
})
