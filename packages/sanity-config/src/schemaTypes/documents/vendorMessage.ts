import {defineField, defineType} from 'sanity'

const DIRECTION_OPTIONS = [
  {title: 'Outbound', value: 'outbound'},
  {title: 'Inbound', value: 'inbound'},
]

const CHANNEL_OPTIONS = [
  {title: 'Email', value: 'email'},
  {title: 'Portal', value: 'portal'},
  {title: 'SMS', value: 'sms'},
  {title: 'Phone', value: 'phone'},
]

const STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'Queued', value: 'queued'},
  {title: 'Sent', value: 'sent'},
  {title: 'Delivered', value: 'delivered'},
  {title: 'Opened', value: 'opened'},
  {title: 'Failed', value: 'failed'},
]

export default defineType({
  name: 'vendorMessage',
  title: 'Vendor Messages',
  type: 'document',
  fields: [
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({
      name: 'direction',
      title: 'Direction',
      type: 'string',
      options: {list: DIRECTION_OPTIONS},
      initialValue: 'outbound',
    }),
    defineField({
      name: 'channel',
      title: 'Channel',
      type: 'string',
      options: {list: CHANNEL_OPTIONS},
      initialValue: 'email',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: STATUS_OPTIONS},
      initialValue: 'draft',
    }),
    defineField({name: 'subject', title: 'Subject', type: 'string'}),
    defineField({name: 'body', title: 'Body', type: 'text', rows: 8}),
    defineField({name: 'templateId', title: 'Template ID', type: 'string'}),
    defineField({name: 'messageId', title: 'Message ID', type: 'string'}),
    defineField({name: 'sentAt', title: 'Sent At', type: 'datetime'}),
    defineField({name: 'openedAt', title: 'Opened At', type: 'datetime'}),
  ],
  preview: {
    select: {
      title: 'subject',
      vendor: 'vendor.companyName',
      status: 'status',
      channel: 'channel',
    },
    prepare(selection) {
      const title = selection.title || 'Vendor Message'
      const status = selection.status || 'status'
      const channel = selection.channel || 'channel'
      const vendor = selection.vendor ? ` · ${selection.vendor}` : ''
      return {title, subtitle: `${channel} · ${status}${vendor}`}
    },
  },
})
