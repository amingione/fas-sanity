import {SparkleIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {GROUPS} from '../../constants'

const STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'In review', value: 'review'},
  {title: 'Ready to publish', value: 'ready'},
  {title: 'Published', value: 'published'},
  {title: 'Needs update', value: 'refresh'},
]

export const seoArticleType = defineType({
  name: 'seoArticle',
  title: 'SEO Article',
  type: 'document',
  icon: SparkleIcon,
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
      description: 'Primary keyword or phrase this article should rank for.',
      validation: (Rule) => Rule.required(),
      group: 'seo',
    }),
    defineField({
      name: 'region',
      type: 'string',
      description: 'Geographic focus (country, state, or metro area).',
      group: 'seo',
    }),
    defineField({
      name: 'ctaText',
      title: 'Call to action text',
      type: 'string',
      description: 'Button or link copy used throughout the article.',
      group: 'editorial',
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: {
        list: STATUS_OPTIONS,
      },
      initialValue: 'draft',
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
      subtitle: 'targetKeyword',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? `Keyword: ${subtitle}` : 'SEO Article',
      }
    },
  },
})
