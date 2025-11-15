import {defineField, defineType} from 'sanity'
import {EnvelopeIcon} from '@sanity/icons'

export default defineType({
  name: 'marketingOptIn',
  title: 'Email Subscriber',
  type: 'document',
  icon: EnvelopeIcon,
  description: 'Contacts that opted into marketing outside of the main customer record.',
  fields: [
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Subscribed', value: 'subscribed'},
          {title: 'Unsubscribed', value: 'unsubscribed'},
          {title: 'Bounced', value: 'bounced'},
        ],
        layout: 'radio',
      },
      initialValue: 'subscribed',
    }),
    defineField({
      name: 'subscribedAt',
      title: 'Subscribed At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'unsubscribedAt',
      title: 'Unsubscribed At',
      type: 'datetime',
      hidden: ({parent}) => parent?.status !== 'unsubscribed',
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {
        list: [
          {title: 'Website form', value: 'website'},
          {title: 'Checkout opt-in', value: 'checkout'},
          {title: 'Manual entry', value: 'manual'},
          {title: 'In-person / event', value: 'event'},
          {title: 'Giveaway / promo', value: 'giveaway'},
          {title: 'Imported list', value: 'import'},
          {title: 'Other', value: 'other'},
        ],
        layout: 'dropdown',
      },
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
      description: 'Optional segmentation tags or interests (e.g. tuning, wheels).',
    }),
    defineField({
      name: 'customerRef',
      title: 'Linked Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      description: 'Associate a subscriber with an existing customer when applicable.',
    }),
    defineField({
      name: 'notes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
    }),
  ],
  preview: {
    select: {
      title: 'email',
      name: 'name',
      status: 'status',
      source: 'source',
    },
    prepare({title, name, status, source}) {
      const statusLabel =
        status === 'unsubscribed' ? 'Unsubscribed' : status === 'bounced' ? 'Bounced' : 'Subscribed'
      const subtitle = [name, source, statusLabel].filter(Boolean).join(' • ')
      return {
        title: title || 'Unknown email',
        subtitle,
      }
    },
  },
  orderings: [
    {
      title: 'Newest first',
      name: 'subscribedAtDesc',
      by: [{field: 'subscribedAt', direction: 'desc'}],
    },
    {
      title: 'Email A → Z',
      name: 'emailAsc',
      by: [{field: 'email', direction: 'asc'}],
    },
  ],
})
