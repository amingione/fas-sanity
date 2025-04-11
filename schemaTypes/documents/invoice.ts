import { defineType, defineField } from 'sanity'
import { createClient } from '@sanity/client'

const sanityClient = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false
})

export default defineType({
  name: 'invoice',
  title: 'Invoice',
  type: 'document',
  fields: [
    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      readOnly: true
    }),
    defineField({
      name: 'quote',
      title: 'Related Quote',
      type: 'reference',
      to: [{ type: 'buildQuote' }]
    }),
    defineField({
      name: 'customerEmail',
      title: 'Customer Email',
      type: 'string'
    }),
    defineField({
      name: 'stripeInvoiceId',
      title: 'Stripe Invoice ID',
      type: 'string',
      readOnly: true
    }),
    defineField({
      name: 'amount',
      title: 'Total Amount',
      type: 'number'
    }),
    defineField({
      name: 'status',
      title: 'Payment Status',
      type: 'string',
      options: {
        list: ['pending', 'paid', 'refunded', 'cancelled'],
        layout: 'dropdown'
      },
      initialValue: 'pending'
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true
    }),
    defineField({
      name: 'stripeReceiptUrl',
      title: 'Stripe Receipt URL',
      type: 'url',
      readOnly: true
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
      description: 'Shipping tracking info if applicable.'
    }),
    defineField({
      name: 'fulfillmentStatus',
      title: 'Fulfillment Status',
      type: 'string',
      options: {
        list: ['unfulfilled', 'in progress', 'fulfilled', 'cancelled']
      },
      initialValue: 'unfulfilled'
    }),
    defineField({
      name: 'invoicePdfUrl',
      title: 'Invoice PDF (Optional)',
      type: 'url'
    }),
    defineField({
      name: 'shippingLabelUrl',
      title: 'Shipping Label PDF',
      type: 'url',
      readOnly: true
    })
 
  ]
})