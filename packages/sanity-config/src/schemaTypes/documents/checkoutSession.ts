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
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sessionNumber',
      type: 'string',
      title: 'Session Number',
      description: 'Human-readable session identifier',
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
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Session Created',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires At',
      description: 'When this checkout session expires',
    }),
    defineField({
      name: 'expiredAt',
      type: 'datetime',
      title: 'Expired At',
      description: 'When this session actually expired',
    }),
    defineField({
      name: 'customerEmail',
      type: 'string',
      title: 'Customer Email',
    }),
    defineField({
      name: 'customerName',
      type: 'string',
      title: 'Customer Name',
    }),
    defineField({
      name: 'customerPhone',
      type: 'string',
      title: 'Customer Phone',
    }),
    defineField({
      name: 'customerRef',
      type: 'reference',
      title: 'Customer Reference',
      to: [{type: 'customer'}],
    }),
    defineField({
      name: 'cart',
      type: 'array',
      title: 'Cart Items',
      description: 'Products added to cart before abandonment',
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
      name: 'invalidCart',
      type: 'boolean',
      title: 'Invalid Cart',
    }),
    defineField({
      name: 'failureReason',
      type: 'string',
      title: 'Failure Reason',
    }),
    defineField({
      name: 'amountSubtotal',
      type: 'number',
      title: 'Subtotal',
    }),
    defineField({
      name: 'amountTax',
      type: 'number',
      title: 'Tax',
    }),
    defineField({
      name: 'amountShipping',
      type: 'number',
      title: 'Shipping',
    }),
    defineField({
      name: 'totalAmount',
      type: 'number',
      title: 'Total Amount',
    }),
    defineField({
      name: 'currency',
      type: 'string',
      title: 'Currency',
      initialValue: 'USD',
    }),
    // Shipping fields
    defineField({
      name: 'shippingOptions',
      title: 'Shipping Options',
      type: 'array',
      description: 'Available shipping options from Stripe',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'shippingRateId',
              title: 'Shipping Rate ID',
              type: 'string',
              description: 'Stripe shipping rate ID (shr_...)',
            },
            {
              name: 'shippingAmount',
              title: 'Shipping Amount',
              type: 'number',
              description: 'Shipping cost in cents',
            },
          ],
          preview: {
            select: {
              rateId: 'shippingRateId',
              amount: 'shippingAmount',
            },
            prepare({rateId, amount}) {
              const amountFormatted =
                typeof amount === 'number' ? `$${(amount / 100).toFixed(2)}` : 'N/A'
              return {
                title: rateId || 'Shipping Option',
                subtitle: amountFormatted,
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'selectedShippingRate',
      title: 'Selected Shipping Rate',
      type: 'string',
      description: 'The shipping rate ID selected by the customer (shr_...)',
    }),
    defineField({
      name: 'shippingCost',
      title: 'Shipping Cost Details',
      type: 'object',
      description: 'Details about the selected shipping option',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        {
          name: 'amount',
          title: 'Amount',
          type: 'number',
          description: 'Shipping cost in cents',
        },
        {
          name: 'displayName',
          title: 'Display Name',
          type: 'string',
          description: 'Human-readable shipping method name',
        },
        {
          name: 'deliveryEstimate',
          title: 'Delivery Estimate',
          type: 'object',
          fields: [
            {
              name: 'minimum',
              title: 'Minimum Days',
              type: 'number',
            },
            {
              name: 'maximum',
              title: 'Maximum Days',
              type: 'number',
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'shippingDetails',
      title: 'Shipping Details',
      type: 'object',
      description: 'Customer shipping information',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        {
          name: 'name',
          title: 'Recipient Name',
          type: 'string',
        },
        {
          name: 'address',
          title: 'Shipping Address',
          type: 'object',
          fields: [
            {
              name: 'line1',
              title: 'Address Line 1',
              type: 'string',
            },
            {
              name: 'line2',
              title: 'Address Line 2',
              type: 'string',
            },
            {
              name: 'city',
              title: 'City',
              type: 'string',
            },
            {
              name: 'state',
              title: 'State',
              type: 'string',
            },
            {
              name: 'postalCode',
              title: 'Postal Code',
              type: 'string',
            },
            {
              name: 'country',
              title: 'Country',
              type: 'string',
            },
          ],
        },
      ],
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
      fields: [
        {
          name: 'raw',
          type: 'text',
          title: 'Raw Metadata (JSON)',
          rows: 5,
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
    }),
    defineField({
      name: 'resendEmailId',
      type: 'string',
      title: 'Resend Email ID',
      description: 'Email ID from Resend for tracking',
    }),
    defineField({
      name: 'emailError',
      type: 'string',
      title: 'Email Error',
      description: 'Error message if email failed to send',
    }),
    defineField({
      name: 'emailErrorAt',
      type: 'datetime',
      title: 'Email Error At',
    }),
    defineField({
      name: 'recovered',
      type: 'boolean',
      title: 'Recovered',
      description: 'Did the customer complete the purchase after abandonment?',
      initialValue: false,
    }),
    defineField({
      name: 'forbiddenOrderRef',
      type: 'reference',
      title: 'Order Reference (Forbidden)',
      to: [{type: 'order'}],
      hidden: true,
      readOnly: true,
      validation: (Rule) =>
        Rule.custom((value) => (value ? 'Checkout sessions must never reference orders.' : true)),
    }),
    defineField({
      name: 'stripeCheckoutUrl',
      type: 'url',
      title: 'Stripe Checkout URL',
      description: 'Recovery link to resume checkout',
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
      shippingMethod: 'shippingCost.displayName',
    },
    prepare({email, name, status, amount, createdAt, recovered, shippingMethod}) {
      const statusEmoji: Record<string, string> = {
        open: '🟢',
        expired: '⏰',
        complete: '✅',
      }

      const amountFormatted =
        typeof amount === 'number' && Number.isFinite(amount) ? amount.toFixed(2) : '0.00'

      const shippingInfo = shippingMethod ? ` • ${shippingMethod}` : ''

      return {
        title: name || email || 'Anonymous',
        subtitle: `${statusEmoji[status || ''] || ''} ${status || 'unknown'} - $${amountFormatted}${
          recovered ? ' (Recovered)' : ''
        }${shippingInfo}`,
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
