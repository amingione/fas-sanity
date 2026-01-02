import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'easypostWebhookEvent',
  title: 'EasyPost Webhook Event',
  type: 'document',
  fields: [
    defineField({
      name: 'eventId',
      title: 'Event ID',
      type: 'string',
      description: 'EasyPost event ID',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'eventType',
      title: 'Event Type',
      type: 'string',
      description: 'Type of event (tracker.updated, etc.)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'payload',
      title: 'Payload',
      type: 'text',
      description: 'Full JSON payload from EasyPost',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'processingStatus',
      title: 'Processing Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Processing', value: 'processing'},
          {title: 'Completed', value: 'completed'},
          {title: 'Failed (Retrying)', value: 'failed_retrying'},
          {title: 'Failed (Permanent)', value: 'failed_permanent'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'error',
      title: 'Error',
      type: 'text',
      readOnly: true,
    }),
    defineField({
      name: 'retryCount',
      title: 'Retry Count',
      type: 'number',
      initialValue: 0,
    }),
  ],
  preview: {
    select: {
      title: 'eventType',
      subtitle: 'eventId',
      status: 'processingStatus',
    },
    prepare({title, subtitle, status}) {
      return {
        title: title || 'Unknown Event',
        subtitle: `${subtitle} - ${status}`,
      }
    },
  },
})
