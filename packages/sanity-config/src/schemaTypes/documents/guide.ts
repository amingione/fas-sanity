import {BookIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {GROUPS} from '../../constants'

const STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'Outlining', value: 'outline'},
  {title: 'In progress', value: 'progress'},
  {title: 'Published', value: 'published'},
  {title: 'Needs refresh', value: 'refresh'},
]

export const guideType = defineType({
  name: 'guide',
  title: 'Guide',
  type: 'document',
  icon: BookIcon,
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
      description: 'Main keyword or intent for this resource.',
      validation: (Rule) => Rule.required(),
      group: 'seo',
    }),
    defineField({
      name: 'region',
      type: 'string',
      description: 'Geo targeting (optional).',
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
      name: 'summary',
      type: 'text',
      rows: 4,
      group: 'editorial',
    }),
    defineField({
      name: 'body',
      type: 'portableText',
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
      subtitle: 'status',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? subtitle.charAt(0).toUpperCase() + subtitle.slice(1) : 'Guide',
      }
    },
  },
})
