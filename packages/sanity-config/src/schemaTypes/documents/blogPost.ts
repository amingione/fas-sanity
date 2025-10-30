import {DocumentsIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {validateSlug} from '../../utils/validateSlug'

export const blogPostType = defineType({
  name: 'blogPost',
  title: 'Blog Post',
  type: 'document',
  icon: DocumentsIcon,
  groups: [
    {
      default: true,
      name: 'editorial',
      title: 'Editorial',
    },
    {
      name: 'seo',
      title: 'SEO',
    },
  ],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'editorial',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {
        source: 'title',
      },
      group: 'editorial',
      validation: validateSlug,
    }),
    defineField({
      name: 'template',
      title: 'Template',
      type: 'reference',
      to: [{type: 'blogTemplate'}],
      description: 'Select the Canva-aligned template that will guide layout and talking points.',
      group: 'editorial',
    }),
    defineField({
      name: 'canvaDesignUrl',
      title: 'Canva Design URL',
      type: 'url',
      description: 'Link directly to the Canva design instance for this article.',
      group: 'editorial',
      validation: (Rule) =>
        Rule.uri({allowRelative: false, scheme: ['https']}).warning(
          'Use a public Canva share link when possible.'
        ),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Publish Date',
      type: 'datetime',
      description: 'Controls blog ordering in feeds and enables scheduled publishing.',
      group: 'editorial',
    }),
    defineField({
      name: 'author',
      type: 'string',
      title: 'Author',
      description: 'Display name for the blog post author.',
      group: 'editorial',
    }),
    defineField({
      name: 'featureImage',
      title: 'Feature Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      group: 'editorial',
    }),
    defineField({
      name: 'featureImageAlt',
      title: 'Feature Image Alt Text',
      type: 'string',
      description: 'Describe the featured image for accessibility and SEO.',
      group: 'editorial',
      validation: (Rule) => Rule.max(160).warning('Keep alt text concise and descriptive.'),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      description: 'Short summary used on listing pages and for search snippets.',
      group: 'editorial',
    }),
    defineField({
      name: 'readingTime',
      title: 'Estimated Reading Time (minutes)',
      type: 'number',
      description: 'Optional manual override for automated reading time calculators.',
      group: 'editorial',
      validation: (Rule) => Rule.min(1).max(60).warning('Use realistic reading time estimates.'),
    }),
    defineField({
      name: 'body',
      title: 'Content',
      type: 'portableText',
      group: 'editorial',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'relatedPosts',
      title: 'Related Posts',
      type: 'array',
      group: 'editorial',
      of: [
        defineField({
          type: 'reference',
          to: [{type: 'blogPost'}],
        }),
      ],
    }),
    defineField({
      name: 'focusKeywords',
      title: 'Focus Keywords',
      type: 'array',
      of: [
        defineField({
          type: 'string',
          name: 'keyword',
        }),
      ],
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
      media: 'featureImage',
      title: 'title',
      subtitle: 'author',
    },
    prepare({media, title, subtitle}) {
      return {
        media,
        title,
        subtitle,
      }
    },
  },
})
