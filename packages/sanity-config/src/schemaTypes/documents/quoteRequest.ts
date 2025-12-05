import {Rule} from 'sanity'

export default {
  name: 'quoteRequest',
  title: 'Quote Request',
  type: 'document',
  fields: [
    {
      name: 'quoteNumber',
      title: 'Quote Number',
      type: 'string',
      validation: (Rule: Rule) => Rule.required(),
    },
    {
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule: Rule) => Rule.required(),
    },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: '📝 New', value: 'new'},
          {title: '👀 Reviewing', value: 'reviewing'},
          {title: '💬 Quoted', value: 'quoted'},
          {title: '✅ Accepted', value: 'accepted'},
          {title: '❌ Declined', value: 'declined'},
          {title: '⏰ Expired', value: 'expired'},
        ],
        layout: 'radio',
      },
      initialValue: 'new',
      validation: (Rule: Rule) => Rule.required(),
    },
    {
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {
        list: [
          {title: '🔴 Urgent', value: 'urgent'},
          {title: '🟡 High', value: 'high'},
          {title: '🟢 Normal', value: 'normal'},
          {title: '⚪ Low', value: 'low'},
        ],
      },
      initialValue: 'normal',
    },
    {
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {
        list: [
          {title: 'SMS/Text', value: 'sms'},
          {title: 'WhatsApp', value: 'whatsapp'},
          {title: 'Email', value: 'email'},
          {title: 'Phone', value: 'phone'},
          {title: 'Website Form', value: 'website'},
          {title: 'In-Store', value: 'in-store'},
        ],
      },
    },
    {
      name: 'vehicle',
      title: 'Vehicle',
      type: 'reference',
      to: [{type: 'vehicle'}],
    },
    {
      name: 'vehicleInfo',
      title: 'Vehicle Information',
      type: 'object',
      description: 'For customers without a vehicle record yet',
      fields: [
        {name: 'year', type: 'number', title: 'Year'},
        {name: 'make', type: 'string', title: 'Make'},
        {name: 'model', type: 'string', title: 'Model'},
        {name: 'trim', type: 'string', title: 'Trim'},
        {name: 'vin', type: 'string', title: 'VIN'},
      ],
    },
    {
      name: 'requestType',
      title: 'Request Type',
      type: 'string',
      options: {
        list: [
          {title: 'Product Purchase', value: 'product'},
          {title: 'Service/Repair', value: 'service'},
          {title: 'Custom Work', value: 'custom'},
          {title: 'Tuning', value: 'tuning'},
          {title: 'Parts & Labor', value: 'parts-labor'},
        ],
      },
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 5,
      description: 'What the customer is requesting',
    },
    {
      name: 'requestedProducts',
      title: 'Requested Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
    },
    {
      name: 'requestedServices',
      title: 'Requested Services',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'service'}]}],
    },
    {
      name: 'lineItems',
      title: 'Quote Line Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'description', type: 'string', title: 'Description'},
            {name: 'quantity', type: 'number', title: 'Quantity', initialValue: 1},
            {name: 'unitPrice', type: 'number', title: 'Unit Price'},
            {name: 'product', type: 'reference', to: [{type: 'product'}], title: 'Product'},
            {name: 'service', type: 'reference', to: [{type: 'service'}], title: 'Service'},
            {name: 'notes', type: 'text', title: 'Notes', rows: 2},
          ],
          preview: {
            select: {
              description: 'description',
              quantity: 'quantity',
              unitPrice: 'unitPrice',
            },
            prepare({
              description,
              quantity,
              unitPrice,
            }: {
              description: string
              quantity: number
              unitPrice: number
            }) {
              const total = quantity * unitPrice
              return {
                title: description,
                subtitle: `Qty: ${quantity} × $${unitPrice?.toFixed(2)} = $${total?.toFixed(2)}`,
              }
            },
          },
        },
      ],
    },
    {
      name: 'subtotal',
      title: 'Subtotal',
      type: 'number',
      readOnly: true,
    },
    {
      name: 'tax',
      title: 'Tax',
      type: 'number',
    },
    {
      name: 'total',
      title: 'Total',
      type: 'number',
      readOnly: true,
    },
    {
      name: 'validUntil',
      title: 'Valid Until',
      type: 'date',
      description: 'Quote expiration date',
    },
    {
      name: 'notes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
    },
    {
      name: 'customerNotes',
      title: 'Notes to Customer',
      type: 'text',
      rows: 3,
      description: 'Will be included in quote',
    },
    {
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [{type: 'file'}],
    },
    {
      name: 'messages',
      title: 'Related Messages',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'customerMessage'}]}],
      readOnly: true,
    },
    {
      name: 'convertedToOrder',
      title: 'Converted to Order',
      type: 'reference',
      to: [{type: 'order'}],
      readOnly: true,
    },
    {
      name: 'assignedTo',
      title: 'Assigned To',
      type: 'reference',
      to: [{type: 'user'}],
    },
    {
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    },
    {
      name: 'quotedAt',
      title: 'Quoted At',
      type: 'datetime',
    },
    {
      name: 'respondedAt',
      title: 'Customer Responded At',
      type: 'datetime',
    },
  ],
  preview: {
    select: {
      quoteNumber: 'quoteNumber',
      customer: 'customer.name',
      status: 'status',
      total: 'total',
    },
    prepare({
      quoteNumber,
      customer,
      status,
      total,
    }: {
      quoteNumber: string
      customer: string
      status: string
      total: number
    }) {
      return {
        title: `${quoteNumber} - ${customer || 'Unknown Customer'}`,
        subtitle: `${status?.toUpperCase()} ${total ? `- $${total.toFixed(2)}` : ''}`,
      }
    },
  },
  orderings: [
    {
      title: 'Created Date, Newest',
      name: 'createdAtDesc',
      by: [{field: 'createdAt', direction: 'desc'}],
    },
    {
      title: 'Priority',
      name: 'priorityDesc',
      by: [{field: 'priority', direction: 'desc'}],
    },
  ],
}
