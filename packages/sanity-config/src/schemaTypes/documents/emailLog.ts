import {defineField, defineType} from 'sanity'
import {SortIcon} from '@sanity/icons'

export default defineType({
  name: 'emailLog',
  title: 'Email Log',
  type: 'document',
  icon: SortIcon,
  fields: [
    defineField({
      name: 'to',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'customer',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({
      name: 'subject',
      type: 'string',
    }),
    defineField({
      name: 'template',
      type: 'reference',
      to: [{type: 'emailTemplate'}],
    }),
    defineField({
      name: 'automation',
      type: 'reference',
      to: [{type: 'emailAutomation'}],
    }),
    defineField({
      name: 'campaign',
      type: 'reference',
      to: [{type: 'emailCampaign'}],
    }),
    defineField({
      name: 'order',
      type: 'reference',
      to: [{type: 'order'}],
    }),
    defineField({
      name: 'appointment',
      type: 'reference',
      to: [{type: 'appointment'}],
    }),
    defineField({
      name: 'contextKey',
      type: 'string',
      description: 'Used internally to prevent duplicate automation emails.',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: {
        list: ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'],
      },
    }),
    defineField({
      name: 'sentAt',
      type: 'datetime',
    }),
    defineField({
      name: 'deliveredAt',
      type: 'datetime',
    }),
    defineField({
      name: 'openedAt',
      type: 'datetime',
    }),
    defineField({
      name: 'clickedAt',
      type: 'datetime',
    }),
    defineField({
      name: 'clickEvents',
      title: 'Click Events',
      type: 'array',
      of: [
        defineField({
          type: 'object',
          name: 'click',
          fields: [
            defineField({name: 'url', type: 'url', title: 'URL'}),
            defineField({name: 'timestamp', type: 'datetime', title: 'Clicked At'}),
          ],
        }),
      ],
      readOnly: true,
    }),
    defineField({
      name: 'emailServiceId',
      type: 'string',
      description: 'ID from email service (SendGrid, etc.)',
    }),
    defineField({
      name: 'error',
      type: 'text',
    }),
  ],
  preview: {
    select: {
      title: 'subject',
      to: 'to',
      status: 'status',
    },
    prepare({title, to, status}) {
      return {
        title: title || '(no subject)',
        subtitle: [to, status].filter(Boolean).join(' • '),
      }
    },
  },
})
