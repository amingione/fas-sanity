import {defineType, defineField} from 'sanity'

const addressFields = [
  defineField({name: 'name', type: 'string', title: 'Name', readOnly: true}),
  defineField({name: 'email', type: 'string', title: 'Email', readOnly: true}),
  defineField({name: 'phone', type: 'string', title: 'Phone', readOnly: true}),
  defineField({name: 'line1', type: 'string', title: 'Line 1', readOnly: true}),
  defineField({name: 'line2', type: 'string', title: 'Line 2', readOnly: true}),
  defineField({name: 'city', type: 'string', title: 'City', readOnly: true}),
  defineField({name: 'state', type: 'string', title: 'State / Province', readOnly: true}),
  defineField({name: 'postalCode', type: 'string', title: 'Postal Code', readOnly: true}),
  defineField({name: 'country', type: 'string', title: 'Country', readOnly: true}),
]

const metadataField = defineField({
  name: 'metadata',
  title: 'Metadata',
  type: 'array',
  readOnly: true,
  of: [
    {
      type: 'object',
      fields: [
        defineField({name: 'key', type: 'string', title: 'Key', readOnly: true}),
        defineField({name: 'value', type: 'text', title: 'Value', readOnly: true}),
        defineField({name: 'source', type: 'string', title: 'Source', readOnly: true}),
      ],
    },
  ],
  options: {layout: 'grid'},
})

export const stripeOrderSummaryType = defineType({
  name: 'stripeOrderSummary',
  title: 'Stripe Snapshot',
  type: 'object',
  readOnly: true,
  options: {collapsible: true, collapsed: true},
  fields: [
    defineField({name: 'updatedAt', type: 'datetime', title: 'Last Synced', readOnly: true}),
    defineField({name: 'status', type: 'string', title: 'Stripe Status', readOnly: true}),
    defineField({name: 'lastEventType', type: 'string', title: 'Last Event', readOnly: true}),
    defineField({
      name: 'lastEventCreated',
      type: 'datetime',
      title: 'Last Event at',
      readOnly: true,
    }),
    defineField({name: 'failureCode', type: 'string', title: 'Failure Code', readOnly: true}),
    defineField({name: 'failureMessage', type: 'text', title: 'Failure Message', readOnly: true}),
    defineField({
      name: 'paymentIntentId',
      type: 'string',
      title: 'Payment Intent ID',
      readOnly: true,
    }),
    defineField({
      name: 'paymentIntentCreated',
      type: 'datetime',
      title: 'Payment Intent Created',
      readOnly: true,
    }),
    defineField({
      name: 'checkoutSessionId',
      type: 'string',
      title: 'Checkout Session ID',
      readOnly: true,
    }),
    defineField({name: 'checkoutStatus', type: 'string', title: 'Checkout Status', readOnly: true}),
    defineField({
      name: 'checkoutExpiresAt',
      type: 'datetime',
      title: 'Checkout Expires At',
      readOnly: true,
    }),
    defineField({name: 'checkoutUrl', type: 'url', title: 'Checkout URL', readOnly: true}),
    defineField({
      name: 'amounts',
      title: 'Amounts',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({name: 'total', type: 'number', title: 'Total', readOnly: true}),
        defineField({name: 'subtotal', type: 'number', title: 'Subtotal', readOnly: true}),
        defineField({name: 'tax', type: 'number', title: 'Tax', readOnly: true}),
        defineField({name: 'shipping', type: 'number', title: 'Shipping', readOnly: true}),
        defineField({name: 'currency', type: 'string', title: 'Currency', readOnly: true}),
        defineField({name: 'captured', type: 'number', title: 'Captured', readOnly: true}),
        defineField({name: 'refunded', type: 'number', title: 'Refunded', readOnly: true}),
      ],
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({name: 'id', type: 'string', title: 'Stripe Customer ID', readOnly: true}),
        defineField({name: 'email', type: 'string', title: 'Email', readOnly: true}),
        defineField({name: 'name', type: 'string', title: 'Name', readOnly: true}),
        defineField({name: 'phone', type: 'string', title: 'Phone', readOnly: true}),
        defineField({name: 'ipAddress', type: 'string', title: 'IP Address', readOnly: true}),
      ],
    }),
    defineField({
      name: 'paymentMethod',
      title: 'Payment Method',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({name: 'type', type: 'string', title: 'Type', readOnly: true}),
        defineField({name: 'brand', type: 'string', title: 'Brand', readOnly: true}),
        defineField({name: 'last4', type: 'string', title: 'Last 4', readOnly: true}),
        defineField({name: 'exp', type: 'string', title: 'Expiration', readOnly: true}),
        defineField({name: 'wallet', type: 'string', title: 'Wallet', readOnly: true}),
        defineField({name: 'issuer', type: 'string', title: 'Issuer', readOnly: true}),
        defineField({name: 'riskLevel', type: 'string', title: 'Risk Level', readOnly: true}),
      ],
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      readOnly: true,
      fields: addressFields,
    }),
    defineField({
      name: 'billingAddress',
      title: 'Billing Address',
      type: 'object',
      readOnly: true,
      fields: addressFields,
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'name', type: 'string', title: 'Name', readOnly: true}),
            defineField({name: 'sku', type: 'string', title: 'SKU', readOnly: true}),
            defineField({name: 'quantity', type: 'number', title: 'Qty', readOnly: true}),
            defineField({name: 'amount', type: 'number', title: 'Amount', readOnly: true}),
            defineField({name: 'metadata', type: 'text', title: 'Metadata', readOnly: true}),
          ],
        },
      ],
    }),
    metadataField,
    defineField({
      name: 'attempts',
      title: 'Attempts',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'type', type: 'string', title: 'Type', readOnly: true}),
            defineField({name: 'status', type: 'string', title: 'Status', readOnly: true}),
            defineField({name: 'created', type: 'datetime', title: 'Created', readOnly: true}),
            defineField({name: 'code', type: 'string', title: 'Code', readOnly: true}),
            defineField({name: 'message', type: 'text', title: 'Message', readOnly: true}),
          ],
        },
      ],
    }),
  ],
})
