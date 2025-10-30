import {SearchIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export const seoMetricsType = defineType({
  name: 'seoMetrics',
  title: 'SEO Metrics',
  type: 'document',
  icon: SearchIcon,
  fields: [
    defineField({
      name: 'keyword',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'url',
      type: 'url',
      description: 'Landing page tracked for this keyword.',
    }),
    defineField({
      name: 'rank',
      title: 'Average rank',
      type: 'number',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'ctr',
      title: 'Click-through rate',
      type: 'number',
      description: 'Percentage value from Google Search Console.',
    }),
    defineField({
      name: 'impressions',
      type: 'number',
    }),
    defineField({
      name: 'clicks',
      type: 'number',
    }),
    defineField({
      name: 'updatedAt',
      title: 'Last updated',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'keyword',
      subtitle: 'url',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle || 'Keyword performance',
      }
    },
  },
})
