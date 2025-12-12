import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'functionLog',
  title: 'Function Log',
  type: 'document',
  fields: [
    defineField({name: 'functionName', type: 'string', title: 'Function Name'}),
    defineField({name: 'status', type: 'string', title: 'Status'}),
    defineField({name: 'executionTime', type: 'datetime', title: 'Execution Time'}),
    defineField({
      name: 'duration',
      type: 'number',
      title: 'Duration (ms)',
      description: 'Execution duration in milliseconds',
    }),
    defineField({name: 'eventData', type: 'text', title: 'Event Data'}),
    defineField({name: 'result', type: 'text', title: 'Result'}),
    defineField({name: 'errorMessage', type: 'text', title: 'Error Message'}),
    defineField({name: 'errorStack', type: 'text', title: 'Error Stack'}),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [
        defineField({name: 'orderId', type: 'string', title: 'Order ID'}),
        defineField({name: 'orderNumber', type: 'string', title: 'Order Number'}),
        defineField({name: 'orderRef', type: 'reference', to: [{type: 'order'}]}),
        defineField({name: 'customerEmail', type: 'string', title: 'Customer Email'}),
        defineField({name: 'webhookId', type: 'string', title: 'Webhook ID'}),
        defineField({name: 'stripeEventId', type: 'string', title: 'Stripe Event ID'}),
        defineField({name: 'invoiceId', type: 'string', title: 'Invoice ID'}),
        defineField({name: 'functionRunId', type: 'string', title: 'Function Run ID'}),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'functionName',
      status: 'status',
      subtitle: 'executionTime',
    },
    prepare(selection) {
      const {title, status, subtitle} = selection
      return {
        title: title || 'Function',
        subtitle: subtitle || 'Execution',
        media: status === 'error' ? '⚠️' : status === 'warning' ? '⚠️' : '✅',
      }
    },
  },
})
