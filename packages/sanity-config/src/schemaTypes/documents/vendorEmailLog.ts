import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorEmailLog',
  title: 'Vendor Email Log',
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
      name: 'campaign',
      title: 'Campaign',
      type: 'reference',
      to: [{type: 'emailCampaign'}],
    }),
    defineField({
      name: 'emailNumber',
      title: 'Email Number',
      type: 'number',
    }),
    defineField({
      name: 'subject',
      title: 'Subject',
      type: 'string',
    }),
    defineField({
      name: 'sentAt',
      title: 'Sent At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Sent', value: 'sent'},
          {title: 'Delivered', value: 'delivered'},
          {title: 'Opened', value: 'opened'},
          {title: 'Clicked', value: 'clicked'},
          {title: 'Bounced', value: 'bounced'},
          {title: 'Failed', value: 'failed'},
        ],
      },
      initialValue: 'sent',
    }),
    defineField({
      name: 'resendId',
      title: 'Resend Email ID',
      type: 'string',
      description: 'Email ID from Resend for tracking',
    }),
  ],
  preview: {
    select: {
      vendor: 'vendor.companyName',
      subject: 'subject',
      sentAt: 'sentAt',
      status: 'status',
    },
    prepare({vendor, subject, sentAt, status}) {
      const date = sentAt ? new Date(sentAt).toLocaleDateString() : 'Pending'
      return {
        title: `${vendor || 'Vendor'} - ${subject || 'Email'}`,
        subtitle: `${date} | ${status || 'sent'}`,
      }
    },
  },
})
