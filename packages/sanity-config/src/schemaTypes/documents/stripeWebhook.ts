import {defineField, defineType} from 'sanity'
import {PlugIcon} from '@sanity/icons'

const STATUS_OPTIONS: Array<{title: string; value: 'processed' | 'ignored' | 'error'}> = [
  {title: 'Processed', value: 'processed'},
  {title: 'Ignored', value: 'ignored'},
  {title: 'Error', value: 'error'},
]

export default defineType({
  name: 'stripeWebhook',
  title: 'Stripe Webhook Event',
  type: 'document',
  icon: PlugIcon,
  groups: [
    {name: 'details', title: 'Details', default: true},
    {name: 'stripe', title: 'Stripe Context'},
    {name: 'relations', title: 'Related Records'},
    {name: 'payload', title: 'Payload'},
  ],
  fields: [
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'string',
      readOnly: true,
      group: 'details',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      readOnly: true,
      options: {
        list: STATUS_OPTIONS,
        layout: 'radio',
      },
      group: 'details',
    }),
    defineField({
      name: 'eventType',
      title: 'Event Type',
      type: 'string',
      readOnly: true,
      group: 'details',
    }),
    defineField({
      name: 'occurredAt',
      title: 'Occurred At',
      type: 'datetime',
      readOnly: true,
      group: 'details',
    }),
    defineField({
      name: 'processedAt',
      title: 'Processed At',
      type: 'datetime',
      readOnly: true,
      group: 'details',
    }),
    defineField({
      name: 'stripeEventId',
      title: 'Stripe Event ID',
      type: 'string',
      readOnly: true,
      validation: (rule) => rule.required(),
      group: 'stripe',
    }),
    defineField({
      name: 'requestId',
      title: 'Request ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'livemode',
      title: 'Live Mode',
      type: 'boolean',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'resourceType',
      title: 'Resource Type',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'resourceId',
      title: 'Resource ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'invoiceStatus',
      title: 'Invoice Status',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'paymentIntentId',
      title: 'Payment Intent ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'chargeId',
      title: 'Charge ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'customerId',
      title: 'Customer ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      readOnly: true,
      group: 'relations',
    }),
    defineField({
      name: 'orderId',
      title: 'Order Document ID',
      type: 'string',
      readOnly: true,
      group: 'relations',
    }),
    defineField({
      name: 'orderRef',
      title: 'Order',
      type: 'reference',
      to: [{type: 'order'}],
      readOnly: true,
      group: 'relations',
    }),
    defineField({
      name: 'invoiceId',
      title: 'Invoice Document ID',
      type: 'string',
      readOnly: true,
      group: 'relations',
    }),
    defineField({
      name: 'invoiceRef',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
      readOnly: true,
      group: 'relations',
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'text',
      readOnly: true,
      rows: 6,
      group: 'payload',
    }),
    defineField({
      name: 'rawPayload',
      title: 'Raw Payload',
      type: 'text',
      readOnly: true,
      rows: 16,
      group: 'payload',
    }),
  ],
  orderings: [
    {
      title: 'Occurred At, newest first',
      name: 'occurredAtDesc',
      by: [{field: 'occurredAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      summary: 'summary',
      eventType: 'eventType',
      status: 'status',
      occurredAt: 'occurredAt',
    },
    prepare({summary, eventType, status, occurredAt}) {
      const title = summary || eventType || 'Stripe webhook event'
      const statusLabel = status ? status.toUpperCase() : 'PROCESSED'
      const when = occurredAt ? new Date(occurredAt).toLocaleString() : ''
      const subtitle = [statusLabel, when].filter(Boolean).join(' • ')
      return {
        title,
        subtitle,
      }
    },
  },
})
