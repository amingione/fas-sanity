import {defineField, defineType} from 'sanity'

const categoryOptions = [
  {title: 'Source', value: 'source'},
  {title: 'Person', value: 'person'},
  {title: 'Issuing dispute', value: 'issuing_dispute'},
]

const humanize = (value?: string | null) => {
  if (!value) return ''
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default defineType({
  name: 'stripeWebhookEvent',
  title: 'Stripe Webhook Event',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'eventId',
      title: 'Event ID',
      type: 'string',
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'eventType',
      title: 'Event type',
      type: 'string',
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      readOnly: true,
      options: {list: categoryOptions},
    }),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'livemode',
      title: 'Live mode',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'resourceId',
      title: 'Resource ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'resourceType',
      title: 'Resource type',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'requestId',
      title: 'Request ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'apiVersion',
      title: 'API version',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'text',
      rows: 4,
      readOnly: true,
    }),
    defineField({
      name: 'data',
      title: 'Data snapshot',
      type: 'text',
      rows: 6,
      readOnly: true,
    }),
    defineField({
      name: 'payload',
      title: 'Raw event payload',
      type: 'text',
      rows: 8,
      readOnly: true,
    }),
    defineField({
      name: 'createdAt',
      title: 'Event created at',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'receivedAt',
      title: 'Received at',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  orderings: [
    {
      name: 'receivedAtDesc',
      title: 'Received (newest first)',
      by: [{field: 'receivedAt', direction: 'desc'}],
    },
    {
      name: 'createdAtDesc',
      title: 'Created (newest first)',
      by: [{field: 'createdAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'summary',
      subtitle: 'eventType',
      category: 'category',
      status: 'status',
      receivedAt: 'receivedAt',
    },
    prepare(selection) {
      const {title, subtitle, category, status, receivedAt} = selection as {
        title?: string
        subtitle?: string
        category?: string
        status?: string
        receivedAt?: string
      }

      const suffix: string[] = []
      if (status) suffix.push(status)
      if (receivedAt) {
        try {
          suffix.push(new Date(receivedAt).toLocaleString())
        } catch {
          suffix.push(receivedAt)
        }
      }

      const label = title || [humanize(category), subtitle].filter(Boolean).join(' • ') || 'Stripe Webhook Event'
      const subtitleLabel = [subtitle, suffix.join(' • ')].filter(Boolean).join(' — ')

      return {
        title: label,
        subtitle: subtitleLabel,
      }
    },
  },
})
