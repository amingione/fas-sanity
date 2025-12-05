import {Rule} from '@sanity/types'

export default {
  name: 'customerMessage',
  title: 'Customer Message',
  type: 'document',
  fields: [
    {
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule: Rule) => Rule.required(),
    },
    {
      name: 'direction',
      title: 'Direction',
      type: 'string',
      options: {
        list: [
          {title: 'Inbound (from customer)', value: 'inbound'},
          {title: 'Outbound (to customer)', value: 'outbound'},
        ],
      },
      validation: (Rule: Rule) => Rule.required(),
    },
    {
      name: 'channel',
      title: 'Channel',
      type: 'string',
      options: {
        list: [
          {title: 'SMS', value: 'sms'},
          {title: 'WhatsApp', value: 'whatsapp'},
          {title: 'Email', value: 'email'},
          {title: 'Phone', value: 'phone'},
        ],
      },
      initialValue: 'sms',
    },
    {
      name: 'phoneNumber',
      title: 'Phone Number',
      type: 'string',
      description: 'Customer phone number (E.164 format)',
    },
    {
      name: 'subject',
      title: 'Subject',
      type: 'string',
    },
    {
      name: 'body',
      title: 'Message Body',
      type: 'text',
      rows: 5,
      validation: (Rule: Rule) => Rule.required(),
    },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Queued', value: 'queued'},
          {title: 'Sent', value: 'sent'},
          {title: 'Delivered', value: 'delivered'},
          {title: 'Failed', value: 'failed'},
          {title: 'Received', value: 'received'},
          {title: 'Read', value: 'read'},
        ],
      },
      initialValue: 'queued',
    },
    {
      name: 'twilioSid',
      title: 'Twilio Message SID',
      type: 'string',
      description: 'Twilio message identifier',
      readOnly: true,
    },
    {
      name: 'twilioStatus',
      title: 'Twilio Status',
      type: 'string',
      readOnly: true,
    },
    {
      name: 'errorCode',
      title: 'Error Code',
      type: 'string',
      hidden: ({document}: {document: any}) => !document?.errorCode,
    },
    {
      name: 'errorMessage',
      title: 'Error Message',
      type: 'text',
      rows: 2,
      hidden: ({document}: {document: any}) => !document?.errorMessage,
    },
    {
      name: 'relatedOrder',
      title: 'Related Order',
      type: 'reference',
      to: [{type: 'order'}],
    },
    {
      name: 'relatedQuote',
      title: 'Related Quote',
      type: 'reference',
      to: [{type: 'quoteRequest'}],
    },
    {
      name: 'relatedAppointment',
      title: 'Related Appointment',
      type: 'reference',
      to: [{type: 'appointment'}],
    },
    {
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'url', type: 'url', title: 'URL'},
            {name: 'contentType', type: 'string', title: 'Content Type'},
            {name: 'filename', type: 'string', title: 'Filename'},
          ],
        },
      ],
    },
    {
      name: 'sentAt',
      title: 'Sent At',
      type: 'datetime',
    },
    {
      name: 'deliveredAt',
      title: 'Delivered At',
      type: 'datetime',
    },
    {
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    },
    {
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [
        {name: 'campaignId', type: 'string', title: 'Campaign ID'},
        {name: 'automationId', type: 'string', title: 'Automation ID'},
        {name: 'tags', type: 'array', of: [{type: 'string'}], title: 'Tags'},
      ],
    },
  ],
  preview: {
    select: {
      customer: 'customer.name',
      body: 'body',
      direction: 'direction',
      createdAt: 'createdAt',
    },
    prepare({
      customer,
      body,
      direction,
      createdAt,
    }: {
      customer: string
      body: string
      direction: string
      createdAt: string
    }) {
      const arrow = direction === 'inbound' ? '←' : '→'
      return {
        title: `${arrow} ${customer || 'Unknown Customer'}`,
        subtitle: body?.substring(0, 60) + (body?.length > 60 ? '...' : ''),
        description: createdAt ? new Date(createdAt).toLocaleString() : '',
      }
    },
  },
  orderings: [
    {
      title: 'Created Date, Newest',
      name: 'createdAtDesc',
      by: [{field: 'createdAt', direction: 'desc'}],
    },
  ],
}
