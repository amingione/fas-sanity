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

/**
 * DEPRECATED: This document type is used only for webhook processing tracking.
 * The 'stripeWebhook' document type is the primary webhook event store with complete data.
 * 
 * This type creates minimal documents during webhook processing to track:
 * - Processing status (pending, processing, completed, failed)
 * - Retry attempts
 * - Processing timestamps
 * 
 * Non-processing fields on this type (for example, summary or category) may be left null
 * as they are not used for processing tracking. The occurredAt field exists on 'stripeWebhook'
 * only; use that document type for complete event data.
 */
export default defineType({
  name: 'stripeWebhookEvent',
  title: 'Stripe Webhook Event (Processing Log)',
  type: 'document',
  readOnly: false,
  fields: [
    defineField({
      name: 'eventId',
      title: 'Event ID',
      type: 'string',
      readOnly: false,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'eventType',
      title: 'Event type',
      type: 'string',
      readOnly: false,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      readOnly: false,
      options: {list: categoryOptions},
    }),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'livemode',
      title: 'Live mode',
      type: 'boolean',
      readOnly: false,
    }),
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'number',
      readOnly: false,
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'resourceId',
      title: 'Resource ID',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'resourceType',
      title: 'Resource type',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'requestId',
      title: 'Request ID',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'apiVersion',
      title: 'API version',
      type: 'string',
      readOnly: false,
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'text',
      rows: 4,
      readOnly: false,
    }),
    defineField({
      name: 'data',
      title: 'Data snapshot',
      type: 'text',
      rows: 6,
      readOnly: false,
    }),
    defineField({
      name: 'payload',
      title: 'Raw event payload',
      type: 'text',
      rows: 8,
      readOnly: false,
    }),
    defineField({
      name: 'createdAt',
      title: 'Event created at',
      type: 'datetime',
      readOnly: false,
    }),
    defineField({
      name: 'receivedAt',
      title: 'Received at',
      type: 'datetime',
      readOnly: false,
    }),
    defineField({
      name: 'processed',
      title: 'Processed',
      type: 'boolean',
      description: 'Whether this event was successfully processed',
      initialValue: false,
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
      description: 'Error message if processing failed',
      readOnly: true,
    }),
    defineField({
      name: 'errorStack',
      title: 'Error Stack',
      type: 'text',
      description: 'Full error stack trace for debugging',
      readOnly: true,
    }),
    defineField({
      name: 'retryCount',
      title: 'Retry Count',
      type: 'number',
      description: 'Number of processing attempts',
      initialValue: 0,
    }),
    defineField({
      name: 'lastRetryAt',
      title: 'Last Retry At',
      type: 'datetime',
      description: 'Timestamp of last retry attempt',
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

      const label =
        title ||
        [humanize(category), subtitle].filter(Boolean).join(' • ') ||
        'Stripe Webhook Event'
      const subtitleLabel = [subtitle, suffix.join(' • ')].filter(Boolean).join(' — ')

      return {
        title: label,
        subtitle: subtitleLabel,
      }
    },
  },
})
