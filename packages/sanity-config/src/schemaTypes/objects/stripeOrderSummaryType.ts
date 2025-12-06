import {defineType, defineField} from 'sanity'

const addressFields = [
  defineField({name: 'name', type: 'string', title: 'Name', readOnly: false}),
  defineField({name: 'email', type: 'string', title: 'Email', readOnly: false}),
  defineField({name: 'phone', type: 'string', title: 'Phone', readOnly: false}),
  defineField({name: 'line1', type: 'string', title: 'Line 1', readOnly: false}),
  defineField({name: 'line2', type: 'string', title: 'Line 2', readOnly: false}),
  defineField({name: 'city', type: 'string', title: 'City', readOnly: false}),
  defineField({name: 'state', type: 'string', title: 'State / Province', readOnly: false}),
  defineField({name: 'postalCode', type: 'string', title: 'Postal Code', readOnly: false}),
  defineField({name: 'country', type: 'string', title: 'Country', readOnly: false}),
]

const metadataField = defineField({
  name: 'metadata',
  title: 'Metadata',
  type: 'array',
  readOnly: false,
  of: [
    {
      type: 'object',
      fields: [
        defineField({name: 'key', type: 'string', title: 'Key', readOnly: false}),
        defineField({name: 'value', type: 'text', title: 'Value', readOnly: false}),
        defineField({name: 'source', type: 'string', title: 'Source', readOnly: false}),
      ],
    },
  ],
  options: {layout: 'grid'},
})

export const stripeOrderSummaryType = defineType({
  name: 'stripeOrderSummary',
  title: 'Stripe Snapshot',
  type: 'object',
  readOnly: false,
  options: {collapsible: true, collapsed: true},
  fields: [
    defineField({name: 'updatedAt', type: 'datetime', title: 'Last Synced', readOnly: false}),
    defineField({name: 'status', type: 'string', title: 'Stripe Status', readOnly: false}),
    defineField({name: 'lastEventType', type: 'string', title: 'Last Event', readOnly: false}),
    defineField({
      name: 'lastEventCreated',
      type: 'datetime',
      title: 'Last Event at',
      readOnly: false,
    }),
    defineField({name: 'failureCode', type: 'string', title: 'Failure Code', readOnly: false}),
    defineField({name: 'failureMessage', type: 'text', title: 'Failure Message', readOnly: false}),
    defineField({
      name: 'paymentIntentId',
      type: 'string',
      title: 'Payment Intent ID',
      readOnly: false,
    }),
    defineField({
      name: 'paymentIntentCreated',
      type: 'datetime',
      title: 'Payment Intent Created',
      readOnly: false,
    }),
    defineField({
      name: 'checkoutSessionId',
      type: 'string',
      title: 'Checkout Session ID',
      readOnly: false,
    }),
    defineField({
      name: 'checkoutStatus',
      type: 'string',
      title: 'Checkout Status',
      readOnly: false,
    }),
    defineField({
      name: 'checkoutExpiresAt',
      type: 'datetime',
      title: 'Checkout Expires At',
      readOnly: false,
    }),
    defineField({name: 'checkoutUrl', type: 'url', title: 'Checkout URL', readOnly: false}),
    defineField({
      name: 'amounts',
      title: 'Amounts',
      type: 'object',
      readOnly: false,
      fields: [
        defineField({name: 'total', type: 'number', title: 'Total', readOnly: false}),
        defineField({name: 'subtotal', type: 'number', title: 'Subtotal', readOnly: false}),
        defineField({name: 'tax', type: 'number', title: 'Tax', readOnly: false}),
        defineField({name: 'shipping', type: 'number', title: 'Shipping', readOnly: false}),
        defineField({name: 'currency', type: 'string', title: 'Currency', readOnly: false}),
        defineField({name: 'captured', type: 'number', title: 'Captured', readOnly: false}),
        defineField({name: 'refunded', type: 'number', title: 'Refunded', readOnly: false}),
      ],
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'object',
      readOnly: false,
      fields: [
        defineField({name: 'id', type: 'string', title: 'Stripe Customer ID', readOnly: false}),
        defineField({name: 'email', type: 'string', title: 'Email', readOnly: false}),
        defineField({name: 'name', type: 'string', title: 'Name', readOnly: false}),
        defineField({name: 'phone', type: 'string', title: 'Phone', readOnly: false}),
        defineField({name: 'ipAddress', type: 'string', title: 'IP Address', readOnly: false}),
      ],
    }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'object',
      readOnly: false,
      fields: [
        defineField({name: 'type', type: 'string', title: 'Type', readOnly: false}),
        defineField({name: 'brand', type: 'string', title: 'Brand', readOnly: false}),
        defineField({name: 'last4', type: 'string', title: 'Last 4', readOnly: false}),
        defineField({name: 'exp', type: 'string', title: 'Expiration', readOnly: false}),
        defineField({name: 'wallet', type: 'string', title: 'Wallet', readOnly: false}),
        defineField({name: 'issuer', type: 'string', title: 'Issuer', readOnly: false}),
        defineField({name: 'riskLevel', type: 'string', title: 'Risk Level', readOnly: false}),
      ],
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      readOnly: false,
      fields: addressFields,
    }),
    defineField({
      name: 'billingAddress',
      title: 'Billing Address',
      type: 'object',
      readOnly: false,
      fields: addressFields,
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      readOnly: false,
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'name', type: 'string', title: 'Name', readOnly: false}),
            defineField({name: 'sku', type: 'string', title: 'SKU', readOnly: false}),
            defineField({name: 'quantity', type: 'number', title: 'Qty', readOnly: false}),
            defineField({name: 'amount', type: 'number', title: 'Amount', readOnly: false}),
            defineField({name: 'metadata', type: 'text', title: 'Metadata', readOnly: false}),
          ],
        },
      ],
    }),
    metadataField,
    defineField({
      name: 'attempts',
      title: 'Attempts',
      type: 'array',
      readOnly: false,
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'type', type: 'string', title: 'Type', readOnly: false}),
            defineField({name: 'status', type: 'string', title: 'Status', readOnly: false}),
            defineField({name: 'created', type: 'datetime', title: 'Created', readOnly: false}),
            defineField({name: 'code', type: 'string', title: 'Code', readOnly: false}),
            defineField({name: 'message', type: 'text', title: 'Message', readOnly: false}),
          ],
        },
      ],
    }),
  ],
})
