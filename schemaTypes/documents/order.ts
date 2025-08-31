import { defineType, defineField } from 'sanity'
import FulfillmentBadge from '../../components/inputs/FulfillmentBadge'

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    defineField({ name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string' }),
    defineField({ name: 'customerEmail', title: 'Customer Email', type: 'string' }),
    defineField({ name: 'customerRef', title: 'Customer Reference', type: 'reference', to: [{ type: 'customer' }] }),
    defineField({ name: 'invoiceRef', title: 'Linked Invoice', type: 'reference', to: [{ type: 'invoice' }] }),
    defineField({ name: 'cart', title: 'Cart Items', type: 'array', of: [ { type: 'orderCartItem' } ] }),
    defineField({ name: 'totalAmount', title: 'Total Amount (USD)', type: 'number' }),
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
