import {defineField, defineType} from 'sanity'

const NOTIFICATION_TYPES = [
  {title: 'Info', value: 'info'},
  {title: 'Success', value: 'success'},
  {title: 'Warning', value: 'warning'},
  {title: 'Error', value: 'error'},
]

export default defineType({
  name: 'vendorNotification',
  title: 'Vendor Notifications',
  type: 'document',
  fields: [
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({name: 'title', title: 'Title', type: 'string'}),
    defineField({name: 'message', title: 'Message', type: 'text', rows: 4}),
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {list: NOTIFICATION_TYPES},
      initialValue: 'info',
    }),
    defineField({name: 'read', title: 'Read', type: 'boolean', initialValue: false}),
    defineField({name: 'actionUrl', title: 'Action URL', type: 'string'}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime'}),
  ],
  preview: {
    select: {
      title: 'title',
      vendor: 'vendor.companyName',
      read: 'read',
      type: 'type',
    },
    prepare(selection) {
      const title = selection.title || 'Vendor Notification'
      const vendor = selection.vendor ? ` · ${selection.vendor}` : ''
      const readState = selection.read ? 'read' : 'unread'
      const type = selection.type || 'info'
      return {title, subtitle: `${type} · ${readState}${vendor}`}
    },
  },
})
