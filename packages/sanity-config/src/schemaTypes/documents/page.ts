import {DocumentIcon} from '@sanity/icons'
import {defineField} from 'sanity'

import {validateSlug} from '../../utils/validateSlug'
import { GROUPS } from '../../constants'

export const pageType = defineField({
  name: 'page',
  title: 'Page',
  type: 'document',
  icon: DocumentIcon,
  groups: GROUPS,
  fields: [
    defineField({
      name: 'title',
      group: 'editorial',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      group: 'editorial',
      type: 'slug',
      options: {source: 'title'},
      validation: validateSlug,
    }),
    defineField({
      name: 'colorTheme',
      type: 'reference',
      to: [{type: 'colorTheme'}],
      group: 'theme',
    }),
    defineField({
      name: 'showHero',
      type: 'boolean',
      description: 'If disabled, page title will be displayed instead',
      initialValue: false,
      group: 'editorial',
    }),
    defineField({
      name: 'hero',
      type: 'hero',
      hidden: ({document}) => !document?.showHero,
      group: 'editorial',
    }),
    defineField({
      name: 'body',
      type: 'portableText',
      group: 'editorial',
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description: 'Surface relevant products for readers to explore next.',
      group: 'seo',
    }),
    defineField({
      name: 'relatedBlogs',
      title: 'Related blog posts',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'blog'}]}],
      description: 'Link to supporting educational content to boost internal linking.',
      group: 'seo',
    }),
    defineField({
      name: 'relatedFaqs',
      title: 'Related FAQs',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'faq'}]}],
      description: 'Cross-link to relevant FAQ entries to answer follow-up questions.',
      group: 'seo',
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      group: 'seo',
    }),
  ],
  preview: {
    select: {
      seoImage: 'seo.image',
      title: 'title',
    },
    prepare({seoImage, title}) {
      return {
        media: seoImage ?? DocumentIcon,
        title,
      }
    },
  },
})
