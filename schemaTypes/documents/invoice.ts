import { defineType, defineField } from 'sanity'
import { createClient } from '@sanity/client'
import FulfillmentBadge from '../../components/inputs/FulfillmentBadge'
import PrintPackingSlipButton from '../../components/inputs/PrintPackingSlipButton'
import { StringInputProps } from 'sanity'

const getSanityClient = () =>
  createClient({
    projectId: 'r4og35qd',
    dataset: 'production',
    apiVersion: '2024-04-10',
    token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
    useCdn: false
  })

export default defineType({
  name: 'invoice',
  title: 'Invoice',
  type: 'document',
  fields: [
    defineField({ name: 'invoiceNumber', title: 'Invoice Number', type: 'string', readOnly: true }),
    defineField({ name: 'quote', title: 'Related Quote', type: 'reference', to: [{ type: 'buildQuote' }] }),
    defineField({ name: 'customerEmail', title: 'Customer Email', type: 'string' }),
    defineField({ name: 'stripeInvoiceId', title: 'Stripe Invoice ID', type: 'string', readOnly: true }),
    defineField({ name: 'amount', title: 'Total Amount', type: 'number' }),
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
    defineField({ name: 'stripeReceiptUrl', title: 'Stripe Receipt URL', type: 'url', readOnly: true }),
    defineField({ name: 'trackingNumber', title: 'Tracking Number', type: 'string', description: 'Shipping tracking info if applicable.' }),
    defineField({
      name: 'fulfillmentStatus',
      title: 'Fulfillment Status',
      type: 'string',
      options: {
        list: ['unfulfilled', 'in progress', 'fulfilled', 'cancelled']
      },
      initialValue: 'unfulfilled'
    }),
    defineField({ name: 'invoicePdfUrl', title: 'Invoice PDF (Optional)', type: 'url' }),
    defineField({ name: 'shippingLabelUrl', title: 'Shipping Label PDF', type: 'url', readOnly: true }),
    defineField({
      name: 'shippingMethod',
      title: 'Shipping Method',
      type: 'string',
      options: {
        list: ['Standard', 'Next Day Air', '2-Day', 'International']
      }
    }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'string',
      options: {
        list: ['Stripe', 'PayPal', 'Cash', 'Wire Transfer', 'Manual']
      }
    }),
    defineField({
      name: 'timeline',
      title: 'Order Timeline',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'action', type: 'string', title: 'Action' },
            { name: 'timestamp', type: 'datetime', title: 'Timestamp' }
          ]
        }
      ]
    }),
    defineField({ name: 'shippingLabel', title: 'Shipping Label', type: 'reference', to: [{ type: 'shippingLabel' }] }),

    defineField({
      name: 'statusBadge',
      title: 'Payment Status Display',
      type: 'string',
      components: {
        input: FulfillmentBadge
      },
      readOnly: true
    }),

    defineField({
      name: 'packingSlipButton',
      title: 'Packing Slip Button',
      type: 'string',
      components: {
        input: PrintPackingSlipButton
      },
      readOnly: true
    }),

    defineField({ name: 'orderId', title: 'Order ID', type: 'string', readOnly: true })
  ],

  initialValue: async () => {
    const random = Math.floor(Math.random() * 1000000)
    const orderId = `FAS-${random.toString().padStart(6, '0')}`
    return { orderId }
  }
})