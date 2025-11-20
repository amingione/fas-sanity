import {defineField, defineType} from 'sanity'
import {LinkIcon} from '@sanity/icons'

export default defineType({
  name: 'attribution',
  title: 'Attribution',
  type: 'document',
  icon: LinkIcon,
  fields: [
    defineField({
      name: 'order',
      type: 'reference',
      to: [{type: 'order'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'customer',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({
      name: 'utmSource',
      type: 'string',
      title: 'Source',
      description: 'google, facebook, email, etc.',
    }),
    defineField({
      name: 'utmMedium',
      type: 'string',
      title: 'Medium',
      description: 'cpc, social, email, etc.',
    }),
    defineField({
      name: 'utmCampaign',
      type: 'string',
      title: 'Campaign',
    }),
    defineField({
      name: 'utmTerm',
      type: 'string',
      title: 'Term',
      description: 'Keyword',
    }),
    defineField({
      name: 'utmContent',
      type: 'string',
      title: 'Content',
      description: 'Ad variant',
    }),
    defineField({
      name: 'referrer',
      type: 'url',
      title: 'Referrer URL',
    }),
    defineField({
      name: 'landingPage',
      type: 'url',
      title: 'Landing Page',
    }),
    defineField({
      name: 'device',
      type: 'string',
      options: {list: ['desktop', 'mobile', 'tablet']},
    }),
    defineField({
      name: 'browser',
      type: 'string',
    }),
    defineField({
      name: 'os',
      type: 'string',
    }),
    defineField({
      name: 'sessionId',
      type: 'string',
    }),
    defineField({
      name: 'firstTouch',
      type: 'datetime',
      description: 'First visit',
    }),
    defineField({
      name: 'lastTouch',
      type: 'datetime',
      description: 'Visit that converted',
    }),
    defineField({
      name: 'touchpoints',
      type: 'number',
      description: 'Number of visits before conversion',
    }),
    defineField({
      name: 'orderValue',
      type: 'number',
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'utmCampaign',
      source: 'utmSource',
      order: 'order._ref',
    },
    prepare({title, source, order}) {
      return {
        title: title || source || 'Attribution',
        subtitle: [order, source].filter(Boolean).join(' • '),
      }
    },
  },
})
