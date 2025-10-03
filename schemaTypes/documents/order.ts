import { defineType, defineField } from 'sanity'
import FulfillmentBadge from '../../components/inputs/FulfillmentBadge'
import OrderShippingActions from '../../components/studio/OrderShippingActions'

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    defineField({ name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string' }),
    defineField({ name: 'customerEmail', title: 'Customer Email', type: 'string' }),
    defineField({ name: 'customerRef', title: 'Customer Reference', type: 'reference', to: [{ type: 'customer' }] }),
    defineField({ name: 'invoiceRef', title: 'Linked Invoice', type: 'reference', to: [{ type: 'invoice' }] }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Auto-generated from the Stripe session ID for previews.',
      options: {
        source: 'stripeSessionId',
        slugify: (value: string) =>
          (value || '')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96),
      },
      readOnly: true,
      hidden: true,
    }),
    defineField({ name: 'cart', title: 'Cart Items', type: 'array', of: [ { type: 'orderCartItem' } ] }),
    defineField({ name: 'totalAmount', title: 'Total Amount (USD)', type: 'number' }),
    // Stripe/Payment details (added to match existing data and avoid unknown fields)
    defineField({ name: 'amountSubtotal', title: 'Subtotal Amount', type: 'number', description: 'Order subtotal before shipping/tax' }),
    defineField({ name: 'amountTax', title: 'Tax Amount', type: 'number' }),
    defineField({ name: 'amountShipping', title: 'Shipping Amount', type: 'number' }),
    defineField({ name: 'currency', title: 'Currency', type: 'string' }),
    defineField({ name: 'paymentIntentId', title: 'Payment Intent ID', type: 'string' }),
    defineField({ name: 'chargeId', title: 'Charge ID', type: 'string' }),
    defineField({ name: 'cardBrand', title: 'Card Brand', type: 'string' }),
    defineField({ name: 'cardLast4', title: 'Card Last4', type: 'string' }),
    defineField({ name: 'receiptUrl', title: 'Receipt URL', type: 'url' }),
    defineField({ name: 'paymentStatus', title: 'Payment Status', type: 'string', description: 'Raw Stripe payment status (e.g. succeeded, processing)'}),
    defineField({
      name: 'userId',
      title: 'User ID (Portal)',
      type: 'string',
      description: 'Legacy external id for the purchasing customer. FAS Auth uses the document _id.',
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      options: {
        list: ['pending', 'paid', 'fulfilled', 'cancelled'],
        layout: 'dropdown',
      },
      initialValue: 'pending',
      components: {
        input: FulfillmentBadge, // ✅ Shows badge in Studio
      }
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({ name: 'shippingAddress', title: 'Shipping Address', type: 'shippingAddress' }),
    defineField({
      name: 'shippingCarrier',
      title: 'Shipping Carrier',
      type: 'string',
      options: {
        list: ['UPS', 'FedEx', 'USPS', 'Other'],
        layout: 'dropdown',
      },
    }),
    defineField({ name: 'shippingLabelUrl', title: 'Shipping Label URL', type: 'url' }),
    defineField({ name: 'trackingNumber', title: 'Tracking Number', type: 'string' }),
    defineField({ name: 'packingSlipUrl', title: 'Packing Slip PDF URL', type: 'url' }),
    defineField({ name: 'fulfilledAt', title: 'Fulfilled Date', type: 'datetime' }),
    defineField({ name: 'webhookNotified', title: 'Webhook Notification Sent', type: 'boolean', initialValue: false }),

    // ✅ New Field: shippingLog[]
    defineField({ name: 'shippingLog', title: 'Shipping History', type: 'array', of: [ { type: 'shippingLogEntry' } ] }),

    // Actions to create packing slips and labels directly from the order
    defineField({ name: 'shippingActions', title: 'Shipping', type: 'string', readOnly: true, components: { input: OrderShippingActions } }),
  ],

  preview: {
    select: {
      stripeSessionId: 'stripeSessionId',
      email: 'customerEmail',
      total: 'totalAmount',
      status: 'status',
    },
    prepare({ stripeSessionId, email, total, status }) {
      const badge =
        status === 'fulfilled' ? '✅' :
        status === 'paid' ? '💵' :
        status === 'cancelled' ? '❌' :
        '🕒'
    
      return {
        title: `${email || 'No Email'} - $${total ?? 0}`,
        subtitle: `${badge} #${stripeSessionId?.slice(-6) || 'N/A'} • ${status || 'pending'}`
      }
    }
  },
})
