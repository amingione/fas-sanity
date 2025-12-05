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
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Open', value: 'open'},
          {title: 'Replied', value: 'replied'},
          {title: 'Closed', value: 'closed'},
        ],
      },
      initialValue: 'open',
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {
        list: [
          {title: 'Low', value: 'low'},
          {title: 'Normal', value: 'normal'},
          {title: 'High', value: 'high'},
          {title: 'Urgent', value: 'urgent'},
        ],
      },
      initialValue: 'normal',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Order', value: 'order'},
          {title: 'Payment', value: 'payment'},
          {title: 'Product', value: 'product'},
          {title: 'Technical', value: 'technical'},
          {title: 'General', value: 'general'},
        ],
      },
    }),
    defineField({
      name: 'relatedOrder',
      title: 'Related Order',
      type: 'reference',
      to: [{type: 'order'}, {type: 'purchaseOrder'}],
    }),
    defineField({
      name: 'relatedInvoice',
      title: 'Related Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [{type: 'file'}],
    }),
    defineField({
      name: 'replies',
      title: 'Replies',
      type: 'array',
      of: [
        defineField({
          type: 'object',
          name: 'reply',
          fields: [
            defineField({
              name: 'message',
              title: 'Message',
              type: 'text',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'author',
              title: 'Author',
              type: 'string',
            }),
            defineField({
              name: 'authorEmail',
              title: 'Author Email',
              type: 'string',
            }),
            defineField({
              name: 'timestamp',
              title: 'Timestamp',
              type: 'datetime',
              initialValue: () => new Date().toISOString(),
            }),
            defineField({
              name: 'isStaff',
              title: 'Is Staff Reply',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'attachments',
              title: 'Attachments',
              type: 'array',
              of: [{type: 'file'}],
            }),
          ],
          preview: {
            select: {
              author: 'author',
              message: 'message',
              timestamp: 'timestamp',
            },
            prepare({author, message, timestamp}) {
              const date = timestamp ? new Date(timestamp).toLocaleDateString() : 'No date'
              const previewMessage = message ? `${message.substring(0, 50)}...` : 'Reply'
              return {
                title: author || 'Reply',
                subtitle: `${date} - ${previewMessage}`,
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'lastReplyAt',
      title: 'Last Reply At',
      type: 'datetime',
    }),
    defineField({
      name: 'vendorLastRead',
      title: 'Vendor Last Read',
      type: 'datetime',
      description: 'Track when vendor last read this thread',
    }),
  ],
  preview: {
    select: {
      title: 'subject',
      vendor: 'vendor.companyName',
      status: 'status',
      priority: 'priority',
    },
    prepare({title, vendor, status, priority}) {
      return {
        title: title || 'New Message',
        subtitle: `${vendor || 'Vendor'} | ${status || 'Status'} | ${priority || 'Normal'}`,
      }
    },
  },
})
