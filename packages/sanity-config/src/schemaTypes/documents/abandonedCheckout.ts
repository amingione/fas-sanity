import React from 'react'
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'abandonedCheckout',
  title: 'Abandoned Checkout',
  type: 'document',
  icon: () => '🛒',
  fields: [
    defineField({
      name: 'checkoutId',
      title: 'Checkout ID',
      type: 'string',
      description: 'Internal tracking ID',
      readOnly: true,
    }),
    defineField({
      name: 'stripeSessionId',
      title: 'Stripe Session ID',
      type: 'string',
      description: 'Stripe checkout session ID',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Expired', value: 'expired'},
          {title: 'Recovered', value: 'recovered'},
          {title: 'Ignored', value: 'ignored'},
        ],
      },
      initialValue: 'expired',
    }),
    defineField({
      name: 'customerEmail',
      title: 'Customer Email',
      type: 'email',
      description: 'Email if collected before expiration',
    }),
    defineField({
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      description: 'Reference to customer who abandoned this checkout',
      readOnly: true,
      weak: true,
    }),
    defineField({
      name: 'customerName',
      title: 'Customer Name',
      type: 'string',
    }),
    defineField({
      name: 'customerPhone',
      title: 'Customer Phone',
      type: 'string',
    }),
    defineField({
      name: 'cart',
      title: 'Cart Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'productId', type: 'string', title: 'Product ID'},
            {name: 'productName', type: 'string', title: 'Product Name'},
            {name: 'quantity', type: 'number', title: 'Quantity'},
            {name: 'price', type: 'number', title: 'Price'},
            {name: 'imageUrl', type: 'url', title: 'Image URL'},
            {name: 'slug', type: 'string', title: 'Product Slug'},
          ],
          preview: {
            select: {
              title: 'productName',
              quantity: 'quantity',
              price: 'price',
            },
            prepare({title, quantity, price}) {
              return {
                title: title || 'Unknown Product',
                subtitle: `Qty: ${quantity ?? 0} × $${price?.toFixed(2) ?? '0.00'}`,
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'cartSummary',
      title: 'Cart Summary',
      type: 'text',
      rows: 2,
      description: 'Human-readable cart summary',
      readOnly: true,
    }),
    defineField({
      name: 'amountSubtotal',
      title: 'Subtotal',
      type: 'number',
      description: 'Cart subtotal in dollars',
    }),
    defineField({
      name: 'amountTotal',
      title: 'Total',
      type: 'number',
      description: 'Total including shipping and tax',
    }),
    defineField({
      name: 'shippingCost',
      title: 'Shipping Cost',
      type: 'number',
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      fields: [
        {name: 'name', type: 'string', title: 'Name'},
        {name: 'line1', type: 'string', title: 'Address Line 1'},
        {name: 'line2', type: 'string', title: 'Address Line 2'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State'},
        {name: 'postalCode', type: 'string', title: 'Postal Code'},
        {name: 'country', type: 'string', title: 'Country'},
      ],
    }),
    defineField({
      name: 'sessionMetadata',
      title: 'Session Metadata',
      type: 'object',
      fields: [
        {name: 'browser', type: 'string', title: 'Browser'},
        {name: 'device', type: 'string', title: 'Device'},
        {name: 'os', type: 'string', title: 'Operating System'},
        {name: 'landingPage', type: 'url', title: 'Landing Page'},
        {name: 'referrer', type: 'url', title: 'Referrer'},
        {name: 'shippingMode', type: 'string', title: 'Shipping Mode'},
      ],
    }),
    defineField({
      name: 'recoveryEmailSent',
      title: 'Recovery Email Sent',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'recoveryEmailSentAt',
      title: 'Recovery Email Sent At',
      type: 'datetime',
    }),
    defineField({
      name: 'recoveredOrderId',
      title: 'Recovered Order ID',
      type: 'reference',
      to: [{type: 'order'}],
      description: 'Link to order if customer completed checkout after recovery email',
    }),
    defineField({
      name: 'sessionCreatedAt',
      title: 'Session Created At',
      type: 'datetime',
      description: 'When the checkout session was created',
    }),
    defineField({
      name: 'sessionExpiredAt',
      title: 'Session Expired At',
      type: 'datetime',
      description: 'When the checkout session expired (24 hours after creation)',
    }),
    defineField({
      name: 'notes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
      description: 'Notes about this abandoned checkout',
    }),
  ],
  preview: {
    select: {
      email: 'customerEmail',
      name: 'customerName',
      total: 'amountTotal',
      cartSummary: 'cartSummary',
      expiredAt: 'sessionExpiredAt',
      status: 'status',
    },
    prepare({email, name, total, cartSummary, expiredAt, status}) {
      const customer = email || name || 'Anonymous'
      const amount = typeof total === 'number' ? `$${total.toFixed(2)}` : 'Unknown'
      const date = expiredAt ? new Date(expiredAt).toLocaleDateString() : ''
      const icon = status === 'recovered' ? '✅' : '🛒'
      const iconLabel =
        status === 'recovered' ? 'Recovered checkout' : 'Abandoned checkout session'
      const mediaNode = React.createElement(
        'span',
        {
          role: 'img',
          'aria-label': iconLabel,
          style: {fontSize: '1.25rem', lineHeight: 1},
        },
        icon,
      )
      return {
        title: `${customer} - ${amount}`,
        subtitle: `${cartSummary || 'No items'} • Expired ${date}`,
        media: () => mediaNode,
      }
    },
  },
  orderings: [
    {
      title: 'Expired Date (Newest)',
      name: 'expiredDesc',
      by: [{field: 'sessionExpiredAt', direction: 'desc'}],
    },
    {
      title: 'Total Amount (Highest)',
      name: 'totalDesc',
      by: [{field: 'amountTotal', direction: 'desc'}],
    },
  ],
})
