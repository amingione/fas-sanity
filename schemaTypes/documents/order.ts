import { defineType, defineField } from 'sanity'
import FulfillmentBadge from '../../components/inputs/FulfillmentBadge'
import OrderShippingActions from '../../components/studio/OrderShippingActions'

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    defineField({ name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string' }),
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      description: 'Customer-facing order number shared across Stripe emails, invoices, and Studio.',
      readOnly: true,
    }),
    defineField({ name: 'customerEmail', title: 'Customer Email', type: 'string' }),
    defineField({ name: 'customerRef', title: 'Customer Reference', type: 'reference', to: [{ type: 'customer' }] }),
    defineField({ name: 'customer', title: 'Customer (legacy)', type: 'reference', to: [{ type: 'customer' }], hidden: true, options: { disableNew: true } }),
    defineField({ name: 'customerName', title: 'Customer Name', type: 'string', readOnly: true }),
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
    defineField({ name: 'lineItems', title: 'Line Items (legacy)', type: 'array', of: [ { type: 'orderCartItem' } ], hidden: true, readOnly: true }),
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
    defineField({ name: 'stripeLastSyncedAt', title: 'Stripe Last Synced', type: 'datetime', readOnly: true }),
    defineField({ name: 'paymentFailureCode', title: 'Payment Failure Code', type: 'string', readOnly: true }),
    defineField({ name: 'paymentFailureMessage', title: 'Payment Failure Message', type: 'text', readOnly: true }),
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
    defineField({ name: 'confirmationEmailSent', title: 'Confirmation Email Sent', type: 'boolean', readOnly: true, initialValue: false }),
  ],

  preview: {
    select: {
      stripeSessionId: 'stripeSessionId',
      email: 'customerEmail',
      total: 'totalAmount',
      status: 'status',
      orderNumber: 'orderNumber',
      customerName: 'customerName',
      shippingName: 'shippingAddress.name',
    },
    prepare({ stripeSessionId, email, total, status, orderNumber, customerName, shippingName }) {
      const badge =
        status === 'fulfilled' ? '✅' :
        status === 'paid' ? '💵' :
        status === 'cancelled' ? '❌' :
        '🕒'

      const ref = orderNumber || (stripeSessionId ? `#${stripeSessionId.slice(-6)}` : 'N/A')
      const name = customerName || shippingName || email || 'Customer'
      const amount = typeof total === 'number' ? ` – $${Number(total).toFixed(2)}` : ''
      return {
        title: `${name}${amount}`,
        subtitle: `${badge} ${ref} • ${status || 'pending'}${email ? ` • ${email}` : ''}`
      }
    }
  },
})
