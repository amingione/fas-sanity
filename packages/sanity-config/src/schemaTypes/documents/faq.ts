import {HelpCircleIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {GROUPS} from '../../constants'

export const faqType = defineType({
  name: 'faq',
  title: 'FAQ Entry',
  type: 'document',
  icon: HelpCircleIcon,
  groups: GROUPS,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Internal name for reference in lists.',
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
      name: 'question',
      type: 'string',
      validation: (Rule) => Rule.required(),
      group: 'editorial',
    }),
    defineField({
      name: 'answer',
      type: 'portableText',
      validation: (Rule) => Rule.required(),
      group: 'editorial',
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {
        list: [
          {title: 'Shipping', value: 'shipping'},
          {title: 'Installation', value: 'installation'},
          {title: 'Tuning', value: 'tuning'},
          {title: 'Warranty', value: 'warranty'},
          {title: 'General', value: 'general'},
        ],
      },
      group: 'editorial',
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      group: 'seo',
    }),
    defineField({
      name: 'relatedBlogs',
      title: 'Related blog posts',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'blog'}]}],
      group: 'seo',
    }),
    defineField({
      name: 'relatedFaqs',
      title: 'Related FAQs',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'faq'}]}],
      group: 'seo',
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
      title: 'question',
      subtitle: 'category',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? subtitle.charAt(0).toUpperCase() + subtitle.slice(1) : 'FAQ',
      }
    },
  },
})
