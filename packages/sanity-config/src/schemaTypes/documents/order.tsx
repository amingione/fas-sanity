import React from 'react'
import {defineField, defineType} from 'sanity'
import FulfillmentBadge from '../../components/inputs/FulfillmentBadge'
import OrderShippingActions from '../../components/studio/OrderShippingActions'

const ORDER_MEDIA_URL =
  'https://cdn.sanity.io/images/r4og35qd/production/c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000.png'

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  groups: [
    {name: 'shipping', title: 'Shipping'},
  ],
  fields: [
    defineField({ name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string', readOnly: true }),
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      description: 'Customer-facing order number shared across Stripe emails, invoices, and Studio.',
      readOnly: true,
    }),
    defineField({ name: 'customerEmail', title: 'Customer Email', type: 'string', readOnly: true }),
    defineField({ name: 'customerRef', title: 'Customer Reference', type: 'reference', to: [{ type: 'customer' }], readOnly: true }),
    defineField({ name: 'customer', title: 'Customer (legacy)', type: 'reference', to: [{ type: 'customer' }], hidden: true, options: { disableNew: true }, readOnly: true }),
    defineField({ name: 'customerName', title: 'Customer Name', type: 'string', readOnly: true }),
    defineField({ name: 'invoiceRef', title: 'Linked Invoice', type: 'reference', to: [{ type: 'invoice' }], readOnly: true }),
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
    defineField({ name: 'cart', title: 'Cart Items', type: 'array', of: [ { type: 'orderCartItem' } ], readOnly: true }),
    defineField({ name: 'lineItems', title: 'Line Items (legacy)', type: 'array', of: [ { type: 'orderCartItem' } ], hidden: true, readOnly: true }),
    defineField({ name: 'totalAmount', title: 'Total Amount (USD)', type: 'number', readOnly: true }),
    // Stripe/Payment details (added to match existing data and avoid unknown fields)
    defineField({ name: 'amountSubtotal', title: 'Subtotal Amount', type: 'number', readOnly: true, description: 'Order subtotal before shipping/tax' }),
    defineField({ name: 'amountTax', title: 'Tax Amount', type: 'number', readOnly: true }),
    defineField({ name: 'amountShipping', title: 'Shipping Amount', type: 'number', readOnly: true }),
    defineField({ name: 'currency', title: 'Currency', type: 'string', readOnly: true }),
    defineField({ name: 'paymentIntentId', title: 'Payment Intent ID', type: 'string', readOnly: true }),
    defineField({ name: 'chargeId', title: 'Charge ID', type: 'string', readOnly: true }),
    defineField({ name: 'cardBrand', title: 'Card Brand', type: 'string', readOnly: true }),
    defineField({ name: 'cardLast4', title: 'Card Last4', type: 'string', readOnly: true }),
    defineField({ name: 'receiptUrl', title: 'Receipt URL', type: 'url', readOnly: true }),
    defineField({ name: 'paymentStatus', title: 'Payment Status', type: 'string', description: 'Raw Stripe payment status (e.g. succeeded, processing)', readOnly: true}),
    defineField({ name: 'stripeSessionStatus', title: 'Stripe Session Status', type: 'string', readOnly: true }),
    defineField({ name: 'stripeLastSyncedAt', title: 'Stripe Last Synced', type: 'datetime', readOnly: true }),
    defineField({ name: 'stripeCreatedAt', title: 'Stripe Session Created', type: 'datetime', readOnly: true }),
    defineField({ name: 'stripeExpiresAt', title: 'Stripe Session Expired', type: 'datetime', readOnly: true }),
    defineField({ name: 'paymentFailureCode', title: 'Payment Failure Code', type: 'string', readOnly: true }),
    defineField({ name: 'paymentFailureMessage', title: 'Payment Failure Message', type: 'text', readOnly: true }),
    defineField({
      name: 'stripeSummary',
      title: 'Stripe Snapshot',
      type: 'stripeOrderSummary',
      readOnly: true,
    }),
    defineField({
      name: 'userId',
      title: 'User ID (Portal)',
      type: 'string',
      description: 'Legacy external id for the purchasing customer. FAS Auth uses the document _id.',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      options: {
        list: ['paid', 'fulfilled', 'shipped', 'cancelled', 'refunded', 'closed', 'expired'],
        layout: 'dropdown',
      },
      readOnly: true,
      components: {
        input: FulfillmentBadge as any, // cast to satisfy TS typings
      }
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
    defineField({ name: 'shippingAddress', title: 'Shipping Address', type: 'shippingAddress' }),
    defineField({
      name: 'weight',
      title: 'Package Weight',
      type: 'shipmentWeight',
      description: 'Auto-calculated from cart items.',
      readOnly: true,
    }),
    defineField({
      name: 'dimensions',
      title: 'Package Dimensions',
      type: 'packageDimensions',
      description: 'Auto-filled using product defaults.',
      readOnly: true,
    }),
    defineField({
      name: 'shippingCarrier',
      title: 'Shipping Carrier',
      type: 'string',
      readOnly: true,
      options: {
        list: ['UPS', 'FedEx', 'USPS', 'Other'],
        layout: 'dropdown',
      },
    }),
    defineField({ name: 'shippingLabelUrl', title: 'Shipping Label URL', type: 'url', readOnly: true }),
    defineField({ name: 'trackingNumber', title: 'Tracking Number', type: 'string', readOnly: true }),
    defineField({ name: 'trackingUrl', title: 'Tracking URL', type: 'url', readOnly: true }),
    defineField({ name: 'packingSlipUrl', title: 'Packing Slip PDF URL', type: 'url', readOnly: true }),
    defineField({
      name: 'selectedService',
      title: 'Selected Shipping Rate',
      type: 'object',
      readOnly: true,
      options: { columns: 2 },
      fields: [
        defineField({ name: 'carrierId', title: 'Carrier ID', type: 'string' }),
        defineField({ name: 'carrier', title: 'Carrier', type: 'string' }),
        defineField({ name: 'service', title: 'Service Name', type: 'string' }),
        defineField({ name: 'serviceCode', title: 'Service Code', type: 'string' }),
        defineField({ name: 'amount', title: 'Rate Amount', type: 'number' }),
        defineField({ name: 'currency', title: 'Currency', type: 'string' }),
        defineField({ name: 'deliveryDays', title: 'Est. Delivery (days)', type: 'number' }),
        defineField({ name: 'estimatedDeliveryDate', title: 'Est. Delivery Date', type: 'datetime' }),
      ],
    }),
    defineField({ name: 'selectedShippingAmount', title: 'Selected Shipping Amount', type: 'number', readOnly: true, group: 'shipping' }),
    defineField({ name: 'selectedShippingCurrency', title: 'Selected Shipping Currency', type: 'string', readOnly: true, group: 'shipping' }),
    defineField({ name: 'shippingDeliveryDays', title: 'Shipping Delivery Days', type: 'number', readOnly: true, group: 'shipping' }),
    defineField({ name: 'shippingEstimatedDeliveryDate', title: 'Shipping Estimated Delivery', type: 'datetime', readOnly: true, group: 'shipping' }),
    defineField({ name: 'shippingServiceCode', title: 'Shipping Service Code', type: 'string', readOnly: true, group: 'shipping' }),
    defineField({ name: 'shippingServiceName', title: 'Shipping Service Name', type: 'string', readOnly: true, group: 'shipping' }),
    defineField({
      name: 'shippingMetadata',
      title: 'Shipping Metadata',
      type: 'object',
      readOnly: true,
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: 'shipping_amount', title: 'Amount', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_carrier', title: 'Carrier', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_carrier_id', title: 'Carrier ID', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_currency', title: 'Currency', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_delivery_days', title: 'Delivery Days', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_estimated_delivery_date', title: 'Estimated Delivery', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_service', title: 'Service', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_service_code', title: 'Service Code', type: 'string', readOnly: true }),
        defineField({ name: 'shipping_service_name', title: 'Service Name', type: 'string', readOnly: true }),
      ],
      group: 'shipping',
    }),
    defineField({ name: 'shipStationOrderId', title: 'ShipStation Order ID', type: 'string', readOnly: true }),
    defineField({ name: 'shipStationLabelId', title: 'ShipStation Label ID', type: 'string', readOnly: true }),
    defineField({ name: 'fulfilledAt', title: 'Fulfilled Date', type: 'datetime', readOnly: true }),
    defineField({ name: 'webhookNotified', title: 'Webhook Notification Sent', type: 'boolean', readOnly: true, initialValue: false }),

    // ✅ New Field: shippingLog[]
    defineField({ name: 'shippingLog', title: 'Shipping History', type: 'array', readOnly: true, of: [ { type: 'shippingLogEntry' } ] }),
    defineField({
      name: 'orderEvents',
      title: 'Stripe Event Log',
      type: 'array',
      readOnly: true,
      of: [{type: 'orderEvent'}],
      options: {layout: 'grid'},
    }),

    // Actions to create packing slips and labels directly from the order
    defineField({
      name: 'shippingActions',
      title: 'Shipping',
      type: 'string',
      readOnly: true,
      components: { input: OrderShippingActions as any },
    }),
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
      createdAt: 'createdAt',
    },
    prepare({
      stripeSessionId,
      email,
      total,
      status,
      orderNumber,
      customerName,
      shippingName,
      createdAt,
    }) {
      const ref = orderNumber || (stripeSessionId ? `#${stripeSessionId.slice(-6)}` : 'Order')
      const name = customerName || shippingName || email || 'Customer'
      const amount = typeof total === 'number' ? `• ${new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(total)}` : ''
      const statusLabel = (status || 'paid').toLowerCase()
      const dateLabel = createdAt ? new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric'}).format(new Date(createdAt)) : ''

      const tone: Record<string, {bg: string; fg: string; border: string}> = {
        fulfilled: {bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0'},
        shipped: {bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE'},
        paid: {bg: '#EEF2FF', fg: '#4C1D95', border: '#C4B5FD'},
        cancelled: {bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA'},
        refunded: {bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A'},
        closed: {bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB'},
        expired: {bg: '#F3F4F6', fg: '#374151', border: '#E5E7EB'},
      }

      const badgeTone = tone[statusLabel] || tone.closed

      const StatusBadge = () => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1px 6px',
            borderRadius: '999px',
            border: `1px solid ${badgeTone.border}`,
            backgroundColor: badgeTone.bg,
            color: badgeTone.fg,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {statusLabel}
        </span>
      )

      const MediaLogo = () => (
        <img
          src={ORDER_MEDIA_URL}
          alt="Order"
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            objectFit: 'cover',
          }}
        />
      )

      return {
        title: `${ref} — ${name}`,
        subtitle: [dateLabel, amount].filter(Boolean).join(' '),
        media: MediaLogo,
        status: StatusBadge,
      }
    },
  },

  orderings: [
    {
      title: 'Created Date (Newest)',
      name: 'createdAtDesc',
      by: [
        { field: 'createdAt', direction: 'desc' },
        { field: '_createdAt', direction: 'desc' },
      ],
    },
    {
      title: 'Created Date (Oldest)',
      name: 'createdAtAsc',
      by: [
        { field: 'createdAt', direction: 'asc' },
        { field: '_createdAt', direction: 'asc' },
      ],
    },
    {
      title: 'Fulfilled Date (Newest)',
      name: 'fulfilledAtDesc',
      by: [
        { field: 'fulfilledAt', direction: 'desc' },
        { field: 'createdAt', direction: 'desc' },
      ],
    },
    {
      title: 'Order Total (High → Low)',
      name: 'totalAmountDesc',
      by: [
        { field: 'totalAmount', direction: 'desc' },
      ],
    },
    {
      title: 'Order Number (A → Z)',
      name: 'orderNumberAsc',
      by: [
        { field: 'orderNumber', direction: 'asc' },
      ],
    },
  ],
})
