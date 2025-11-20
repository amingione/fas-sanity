import {defineField, defineType} from 'sanity'
import {EnvelopeIcon} from '@sanity/icons'

export default defineType({
  name: 'emailTemplate',
  title: 'Email Template',
  type: 'document',
  icon: EnvelopeIcon,
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'name'},
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {
        list: [
          {title: 'Transactional', value: 'Transactional'},
          {title: 'Marketing', value: 'Marketing'},
          {title: 'Service Reminder', value: 'Service Reminder'},
          {title: 'Abandoned Cart', value: 'Abandoned Cart'},
          {title: 'Re-engagement', value: 'Re-engagement'},
          {title: 'Promotional', value: 'Promotional'},
        ],
      },
    }),
    defineField({
      name: 'subject',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'previewText',
      type: 'string',
    }),
    defineField({
      name: 'fromName',
      type: 'string',
      initialValue: 'FAS Motorsports',
    }),
    defineField({
      name: 'fromEmail',
      type: 'string',
      initialValue: 'info@fasmotorsports.com',
    }),
    defineField({
      name: 'replyTo',
      type: 'string',
    }),
    defineField({
      name: 'htmlBody',
      type: 'text',
      rows: 10,
      description: 'HTML email body',
    }),
    defineField({
      name: 'textBody',
      type: 'text',
      rows: 10,
      description: 'Plain text fallback',
    }),
    defineField({
      name: 'variables',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Available variables: {{customerName}}, {{orderNumber}}, etc.',
    }),
    defineField({
      name: 'active',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'testEmail',
      type: 'string',
      description: 'Send test to this email',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subject: 'subject',
      category: 'category',
      active: 'active',
    },
    prepare({title, subject, category, active}) {
      return {
        title: title || subject,
        subtitle: [category || 'Uncategorized', active === false ? 'Inactive' : 'Active']
          .filter(Boolean)
          .join(' • '),
      }
    },
  },
})
