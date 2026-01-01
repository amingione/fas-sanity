// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import {defineField, defineType} from 'sanity'
import {PlugIcon} from '@sanity/icons'

const STATUS_OPTIONS: Array<{
  title: string
  value: 'processed' | 'processing' | 'ignored' | 'failed_terminal' | 'error'
}> = [
  {title: 'Processed', value: 'processed'},
  {title: 'Processing', value: 'processing'},
  {title: 'Ignored', value: 'ignored'},
  {title: 'Failed (Terminal)', value: 'failed_terminal'},
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
      readOnly: false,
      group: 'details',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      readOnly: false,
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
      readOnly: false,
      group: 'details',
    }),
    defineField({
      name: 'occurredAt',
      title: 'Occurred At',
      type: 'datetime',
      readOnly: false,
      group: 'details',
    }),
    defineField({
      name: 'processedAt',
      title: 'Processed At',
      type: 'datetime',
      readOnly: false,
      group: 'details',
    }),
    defineField({
      name: 'stripeEventId',
      title: 'Stripe Event ID',
      type: 'string',
      readOnly: false,
      validation: (rule) => rule.required(),
      group: 'stripe',
    }),
    defineField({
      name: 'requestId',
      title: 'Request ID',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'livemode',
      title: 'Live Mode',
      type: 'boolean',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'resourceType',
      title: 'Resource Type',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'resourceId',
      title: 'Resource ID',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'invoiceStatus',
      title: 'Invoice Status',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'paymentIntentId',
      title: 'Payment Intent ID',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'chargeId',
      title: 'Charge ID',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'customerId',
      title: 'Customer ID',
      type: 'string',
      readOnly: false,
      group: 'stripe',
    }),
    defineField({
      name: 'productSkus',
      title: 'Product SKUs',
      type: 'array',
      description: 'SKUs from Stripe product sync webhooks in PREFIX-CODE-FAS format',
      of: [{type: 'string'}],
      validation: (Rule) =>
        Rule.custom((skus) => {
          if (!skus) return true
          const skuPattern = /^[A-Z0-9]+-[A-Z0-9]+-FAS$/
          const invalidSkus = (skus as string[]).filter((sku) => !skuPattern.test(sku))
          if (invalidSkus.length > 0) {
            return `Invalid SKU format: ${invalidSkus.join(', ')}. Expected format: PREFIX-CODE-FAS`
          }
          return true
        }),
      group: 'stripe',
    }),
    defineField({
      name: 'lineItemsDetailed',
      title: 'Line Items (Detailed)',
      type: 'array',
      description: 'Structured product line items from Stripe with normalized SKUs',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'productName',
              title: 'Product Name',
              type: 'string',
            },
            {
              name: 'sku',
              title: 'SKU',
              type: 'string',
              description: 'Normalized SKU in PREFIX-CODE-FAS format',
              validation: (Rule) =>
                Rule.regex(/^[A-Z0-9]+-[A-Z0-9]+-FAS$/, {
                  name: 'SKU Format',
                  invert: false,
                }).error('SKU must follow PREFIX-CODE-FAS format (e.g., PR-RM6S-FAS)'),
            },
            {
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
            },
            {
              name: 'unitPrice',
              title: 'Unit Price',
              type: 'number',
            },
            {
              name: 'totalPrice',
              title: 'Total Price',
              type: 'number',
            },
          ],
        },
      ],
      group: 'stripe',
    }),
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      readOnly: false,
      group: 'relations',
    }),
    defineField({
      name: 'orderRef',
      title: 'Order',
      type: 'reference',
      to: [{type: 'order'}],
      readOnly: false,
      group: 'relations',
    }),
    defineField({
      name: 'invoiceId',
      title: 'Invoice Document ID',
      type: 'string',
      readOnly: false,
      group: 'relations',
    }),
    defineField({
      name: 'invoiceRef',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
      readOnly: false,
      group: 'relations',
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'text',
      readOnly: false,
      rows: 6,
      group: 'payload',
    }),
    defineField({
      name: 'rawPayload',
      title: 'Raw Payload',
      type: 'text',
      readOnly: false,
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
