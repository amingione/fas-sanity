import {defineType, defineField} from 'sanity'

export const quoteTimelineEventType = defineType({
  name: 'quoteTimelineEvent',
  title: 'Timeline Event',
  type: 'object',
  fields: [
    defineField({name: 'action', type: 'string', title: 'Action'}),
    defineField({name: 'timestamp', type: 'datetime', title: 'Timestamp'}),
  ],
})
