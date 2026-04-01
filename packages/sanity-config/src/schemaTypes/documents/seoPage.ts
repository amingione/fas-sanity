import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'seoPage',
  title: 'SEO Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'seoTitle',
      title: 'SEO Title',
      type: 'string',
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'intro',
      title: 'Intro',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      of: [
        defineField({
          name: 'section',
          title: 'Section',
          type: 'object',
          fields: [
            defineField({
              name: 'heading',
              title: 'Heading',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'body',
              title: 'Body',
              type: 'array',
              of: [{type: 'block'}],
            }),
          ],
          preview: {
            select: {title: 'heading'},
          },
        }),
      ],
    }),
    defineField({
      name: 'ctaHeading',
      title: 'CTA Heading',
      type: 'string',
      initialValue: 'Start Your Build',
    }),
    defineField({
      name: 'ctaText',
      title: 'CTA Text',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'ctaButtonLabel',
      title: 'CTA Button Label',
      type: 'string',
      initialValue: 'Request a Quote',
    }),
    defineField({
      name: 'ctaButtonHref',
      title: 'CTA Button Link',
      type: 'string',
      initialValue: '/quote',
    }),
    defineField({
      name: 'medusaCollectionHandle',
      title: 'Medusa Collection Handle',
      type: 'string',
      description: 'Example: hellcat-1000hp',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'featuredProductHandles',
      title: 'Featured Product Handles',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Optional. If set, these specific handles override collection fallback.',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'slug.current',
    },
  },
})
