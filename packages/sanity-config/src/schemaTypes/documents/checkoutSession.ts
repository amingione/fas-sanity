import {BasketIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'checkoutSession',
  type: 'document',
  title: 'Checkout Session',
  icon: BasketIcon,
  fields: [
    defineField({
      name: 'sessionId',
      type: 'string',
      title: 'Stripe Session ID',
      description: 'Stripe checkout session ID (cs_...)',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sessionNumber',
      type: 'string',
      title: 'Session Number',
      description: 'Human-readable session identifier',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      type: 'string',
      title: 'Session Status',
      options: {
        list: [
          {title: '🟢 Open', value: 'open'},
          {title: '⏰ Expired', value: 'expired'},
          {title: '✅ Complete', value: 'complete'},
        ],
        layout: 'dropdown',
      },
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Session Created',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires At',
      description: 'When this checkout session expires',
      readOnly: true,
    }),
    defineField({
      name: 'expiredAt',
      type: 'datetime',
      title: 'Expired At',
      description: 'When this session actually expired',
      readOnly: true,
    }),
    defineField({
      name: 'customerEmail',
      type: 'string',
      title: 'Customer Email',
      readOnly: true,
    }),
    defineField({
      name: 'customerName',
      type: 'string',
      title: 'Customer Name',
      readOnly: true,
    }),
    defineField({
      name: 'customerPhone',
      type: 'string',
      title: 'Customer Phone',
      readOnly: true,
    }),
    defineField({
      name: 'customerRef',
      type: 'reference',
      title: 'Customer Reference',
      to: [{type: 'customer'}],
      readOnly: true,
    }),
    defineField({
      name: 'cart',
      type: 'array',
      title: 'Cart Items',
      description: 'Products added to cart before abandonment',
      readOnly: true,
      of: [
        {
          type: 'object',
          name: 'cartItem',
          title: 'Cart Item',
          fields: [
            {name: 'name', type: 'string', title: 'Product Name'},
            {name: 'productRef', type: 'reference', title: 'Product', to: [{type: 'product'}]},
            {name: 'sku', type: 'string', title: 'SKU'},
            {name: 'id', type: 'string', title: 'Product ID'},
            {name: 'productSlug', type: 'string', title: 'Product Slug'},
            {name: 'image', type: 'url', title: 'Product Image'},
            {name: 'productUrl', type: 'string', title: 'Product URL'},
            {name: 'optionDetails', type: 'array', title: 'Options', of: [{type: 'string'}]},
            {name: 'upgrades', type: 'array', title: 'Upgrades', of: [{type: 'string'}]},
            {name: 'price', type: 'number', title: 'Unit Price'},
            {name: 'quantity', type: 'number', title: 'Quantity'},
            {name: 'total', type: 'number', title: 'Line Total'},
          ],
          preview: {
            select: {
              title: 'name',
              quantity: 'quantity',
              price: 'price',
            },
            prepare({title, quantity, price}) {
              const qty = typeof quantity === 'number' ? quantity : 0
              const unit = typeof price === 'number' ? price : 0
              return {
                title: title,
                subtitle: `Qty: ${qty} × $${unit}`,
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'amountSubtotal',
      type: 'number',
      title: 'Subtotal',
      readOnly: true,
    }),
    defineField({
      name: 'amountTax',
      type: 'number',
      title: 'Tax',
      readOnly: true,
    }),
    defineField({
      name: 'amountShipping',
      type: 'number',
      title: 'Shipping',
      readOnly: true,
    }),
    defineField({
      name: 'totalAmount',
      type: 'number',
      title: 'Total Amount',
      readOnly: true,
    }),
    defineField({
      name: 'currency',
      type: 'string',
      title: 'Currency',
      readOnly: true,
      initialValue: 'USD',
    }),
    defineField({
      name: 'attribution',
      type: 'object',
      title: 'Attribution Data',
      description: 'Marketing attribution and session tracking',
      options: {
        collapsible: true,
        collapsed: true,
      },
      readOnly: true,
      fields: [
        {name: 'source', type: 'string', title: 'Source'},
        {name: 'medium', type: 'string', title: 'Medium'},
        {name: 'campaign', type: 'string', title: 'Campaign'},
        {name: 'content', type: 'string', title: 'Content'},
        {name: 'term', type: 'string', title: 'Term/Keyword'},
        {name: 'landingPage', type: 'url', title: 'Landing Page'},
        {name: 'referrer', type: 'url', title: 'Referrer'},
        {name: 'device', type: 'string', title: 'Device'},
        {name: 'browser', type: 'string', title: 'Browser'},
        {name: 'os', type: 'string', title: 'Operating System'},
        {name: 'sessionId', type: 'string', title: 'Session ID'},
        {name: 'capturedAt', type: 'datetime', title: 'Captured At'},
      ],
    }),
    defineField({
      name: 'metadata',
      type: 'object',
      title: 'Stripe Metadata',
      description: 'Additional metadata from Stripe',
      options: {
        collapsible: true,
        collapsed: true,
      },
      readOnly: true,
      fields: [
        {
          name: 'raw',
          type: 'text',
          title: 'Raw Metadata (JSON)',
          rows: 5,
          readOnly: true,
        },
      ],
    }),
    defineField({
      name: 'recoveryEmailSent',
      type: 'boolean',
      title: 'Recovery Email Sent',
      description: 'Has an abandoned cart email been sent?',
      initialValue: false,
    }),
    defineField({
      name: 'recoveryEmailSentAt',
      type: 'datetime',
      title: 'Recovery Email Sent At',
      readOnly: true,
    }),
    defineField({
      name: 'resendEmailId',
      type: 'string',
      title: 'Resend Email ID',
      description: 'Email ID from Resend for tracking',
      readOnly: true,
    }),
    defineField({
      name: 'emailError',
      type: 'string',
      title: 'Email Error',
      description: 'Error message if email failed to send',
      readOnly: true,
    }),
    defineField({
      name: 'emailErrorAt',
      type: 'datetime',
      title: 'Email Error At',
      readOnly: true,
    }),
    defineField({
      name: 'recovered',
      type: 'boolean',
      title: 'Recovered',
      description: 'Did the customer complete the purchase after abandonment?',
      initialValue: false,
    }),
    defineField({
      name: 'recoveredOrderRef',
      type: 'reference',
      title: 'Recovered Order',
      description: 'Link to the order if customer completed purchase',
      to: [{type: 'order'}],
    }),
    defineField({
      name: 'stripeCheckoutUrl',
      type: 'url',
      title: 'Stripe Checkout URL',
      description: 'Recovery link to resume checkout',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      email: 'customerEmail',
      name: 'customerName',
      status: 'status',
      amount: 'totalAmount',
      createdAt: 'createdAt',
      recovered: 'recovered',
    },
    prepare({email, name, status, amount, createdAt, recovered}) {
      const statusEmoji: Record<string, string> = {
        open: '🟢',
        expired: '⏰',
        complete: '✅',
      }

      const amountFormatted =
        typeof amount === 'number' && Number.isFinite(amount) ? amount.toFixed(2) : '0.00'

      return {
        title: name || email || 'Anonymous',
        subtitle: `${statusEmoji[status || ''] || ''} ${status || 'unknown'} - $${amountFormatted}${
          recovered ? ' (Recovered)' : ''
        }`,
        description: createdAt ? new Date(createdAt).toLocaleDateString() : '',
      }
    },
  },
  orderings: [
    {
      title: 'Created Date (Newest)',
      name: 'createdAtDesc',
      by: [{field: 'createdAt', direction: 'desc'}],
    },
    {
      title: 'Created Date (Oldest)',
      name: 'createdAtAsc',
      by: [{field: 'createdAt', direction: 'asc'}],
    },
    {
      title: 'Amount (Highest)',
      name: 'amountDesc',
      by: [{field: 'totalAmount', direction: 'desc'}],
    },
  ],
})
