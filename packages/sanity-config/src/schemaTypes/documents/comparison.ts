import {DocumentIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {GROUPS} from '../../constants'

const STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'In review', value: 'review'},
  {title: 'Approved', value: 'approved'},
  {title: 'Published', value: 'published'},
  {title: 'Needs refresh', value: 'refresh'},
]

export const comparisonType = defineType({
  name: 'comparison',
  title: 'Comparison Guide',
  type: 'document',
  icon: DocumentIcon,
  groups: GROUPS,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (Rule) => Rule.required(),
      group: 'editorial',
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
      group: 'editorial',
    }),
    defineField({
      name: 'targetKeyword',
      type: 'string',
      description: 'Primary search term (e.g. “Best turbo vs supercharger”).',
      validation: (Rule) => Rule.required(),
      group: 'seo',
    }),
    defineField({
      name: 'region',
      type: 'string',
      description: 'Optional locale targeting for SERP experiments.',
      group: 'seo',
    }),
    defineField({
      name: 'ctaText',
      title: 'Call to action text',
      type: 'string',
      group: 'editorial',
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: {list: STATUS_OPTIONS},
      initialValue: 'draft',
      group: 'editorial',
    }),
    defineField({
      name: 'comparisonTable',
      title: 'Comparison table',
      type: 'portableText',
      description: 'Use table blocks or rich text modules to highlight differences.',
      group: 'editorial',
    }),
    defineField({
      name: 'seo',
      title: 'SEO Metadata',
      type: 'seo',
      group: 'seo',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'targetKeyword',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? `Keyword: ${subtitle}` : 'Comparison guide',
      }
    },
  },
})
