import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorNotification',
  title: 'Vendor Notification',
  type: 'document',
  fields: [
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          {title: 'Order', value: 'order'},
          {title: 'Invoice', value: 'invoice'},
          {title: 'Payment', value: 'payment'},
          {title: 'Message', value: 'message'},
          {title: 'System', value: 'system'},
        ],
      },
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'message',
      title: 'Message',
      type: 'text',
    }),
    defineField({
      name: 'link',
      title: 'Link',
      type: 'string',
      description: 'URL to navigate to when clicked',
    }),
    defineField({
      name: 'read',
      title: 'Read',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      vendor: 'vendor.companyName',
      type: 'type',
      read: 'read',
    },
    prepare({title, vendor, type, read}) {
      return {
        title: title || 'Notification',
        subtitle: `${vendor || 'Vendor'} | ${type || 'Type'} | ${read ? 'Read' : 'Unread'}`,
      }
    },
  },
})
