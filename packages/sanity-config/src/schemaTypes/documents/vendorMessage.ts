import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorMessage',
  title: 'Vendor Message',
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
      name: 'subject',
      title: 'Subject',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'message',
      title: 'Message',
      type: 'text',
      rows: 6,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'direction',
      title: 'Direction',
      type: 'string',
      options: {
        list: [
          {title: 'To Vendor', value: 'to_vendor'},
          {title: 'From Vendor', value: 'from_vendor'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Unread', value: 'unread'},
          {title: 'Read', value: 'read'},
          {title: 'Replied', value: 'replied'},
          {title: 'Archived', value: 'archived'},
        ],
      },
      initialValue: 'unread',
    }),
    defineField({
      name: 'relatedPO',
      title: 'Related Purchase Order',
      type: 'reference',
      to: [{type: 'purchaseOrder'}],
    }),
    defineField({
      name: 'sentBy',
      title: 'Sent By',
      type: 'reference',
      to: [{type: 'user'}],
      readOnly: true,
    }),
    defineField({
      name: 'sentAt',
      title: 'Sent At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'readAt',
      title: 'Read At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [
        defineField({
          type: 'file',
          name: 'attachment',
          fields: [
            defineField({
              name: 'title',
              type: 'string',
              title: 'Title',
            }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'subject',
      vendor: 'vendor.companyName',
      direction: 'direction',
      status: 'status',
    },
    prepare(selection) {
      const {title, vendor, direction, status} = selection
      const arrow = direction === 'from_vendor' ? '←' : '→'
      return {
        title,
        subtitle: `${arrow} ${vendor || 'Vendor'} • ${status || 'Status'}`,
      }
    },
  },
})
