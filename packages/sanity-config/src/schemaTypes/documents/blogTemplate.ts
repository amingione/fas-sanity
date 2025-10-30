import {ComposeIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import {validateSlug} from '../../utils/validateSlug'

export const blogTemplateType = defineType({
  name: 'blogTemplate',
  title: 'Blog Template',
  type: 'document',
  icon: ComposeIcon,
  groups: [
    {
      default: true,
      name: 'editorial',
      title: 'Editorial',
      icon: ComposeIcon,
    },
    {
      name: 'seo',
      title: 'SEO',
      icon: ComposeIcon,
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
      group: 'editorial',
      options: {
        source: 'title',
      },
      validation: validateSlug,
    }),
    defineField({
      name: 'purpose',
      title: 'Purpose & Usage',
      type: 'text',
      rows: 3,
      description:
        'Share quick guidance on when to use this template and how it supports campaign goals.',
      group: 'editorial',
    }),
    defineField({
      name: 'canvaTemplateUrl',
      title: 'Canva Template URL',
      type: 'url',
      description:
        'Paste the share link to the Canva design so editors can duplicate and customize it.',
      group: 'editorial',
      validation: (Rule) => Rule.uri({allowRelative: false, scheme: ['https']}),
    }),
    defineField({
      name: 'designPreview',
      title: 'Design Preview',
      type: 'image',
      description: 'Optional preview image or thumbnail exported from Canva.',
      options: {
        hotspot: true,
      },
      group: 'editorial',
    }),
    defineField({
      name: 'recommendedSections',
      title: 'Recommended Sections',
      description:
        'Outline the hero, modules, or talking points the writer should cover to match the Canva layout.',
      type: 'array',
      of: [
        defineField({
          type: 'string',
          name: 'section',
        }),
      ],
      group: 'editorial',
    }),
    defineField({
      name: 'keywordTargets',
      title: 'Keyword Targets',
      description: 'Primary SEO keywords this template is designed to support.',
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
      name: 'callToAction',
      title: 'Call to Action Prompt',
      description: 'Provide CTA copy or prompts that pair well with the Canva artwork.',
      type: 'text',
      rows: 2,
      group: 'editorial',
    }),
  ],
  preview: {
    select: {
      media: 'designPreview',
      title: 'title',
      subtitle: 'purpose',
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
