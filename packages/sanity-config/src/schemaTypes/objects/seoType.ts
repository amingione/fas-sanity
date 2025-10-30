import {defineField} from 'sanity'

export const seoType = defineField({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  group: 'seo',
  options: {
    collapsed: false,
    collapsible: true,
  },
  fields: [
    defineField({
      name: 'metaTitle',
      title: 'Meta title',
      type: 'string',
      description: 'Optimised title tag (50-60 characters recommended).',
      validation: (Rule) =>
        Rule.max(60).warning('Longer titles may be truncated by search engines'),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      description: 'Compelling summary that encourages clicks (140-160 characters recommended).',
      validation: (Rule) =>
        Rule.max(160).warning('Longer descriptions may be truncated by search engines'),
    }),
    defineField({
      name: 'canonicalUrl',
      title: 'Canonical URL',
      type: 'url',
      description: 'Preferred URL for search engines when duplicate content exists.',
    }),
    defineField({
      name: 'openGraph',
      title: 'Open Graph overrides',
      type: 'object',
      options: {
        collapsed: true,
        collapsible: true,
      },
      fields: [
        defineField({
          name: 'title',
          title: 'Title',
          type: 'string',
        }),
        defineField({
          name: 'description',
          title: 'Description',
          type: 'text',
          rows: 2,
        }),
        defineField({
          name: 'type',
          title: 'Type',
          type: 'string',
          options: {
            list: [
              {title: 'Website', value: 'website'},
              {title: 'Article', value: 'article'},
              {title: 'Product', value: 'product'},
            ],
          },
        }),
        defineField({
          name: 'url',
          title: 'Open Graph URL',
          type: 'url',
          description: 'Explicit share URL for social previews when different from the canonical link.',
        }),
        defineField({
          name: 'image',
          title: 'Image',
          type: 'image',
          options: {
            hotspot: true,
          },
        }),
      ],
    }),
    defineField({
      name: 'jsonLd',
      title: 'Structured data (JSON-LD)',
      type: 'object',
      options: {
        collapsed: true,
        collapsible: true,
      },
      fields: [
        defineField({
          name: 'type',
          title: 'Type',
          type: 'string',
          options: {
            list: [
              {title: 'Organization', value: 'schemaOrganization'},
              {title: 'Product', value: 'schemaProduct'},
              {title: 'Local business', value: 'schemaLocalBusiness'},
            ],
          },
        }),
        defineField({
          name: 'reference',
          title: 'Reference',
          type: 'reference',
          to: [
            {type: 'schemaOrganization'},
            {type: 'schemaProduct'},
            {type: 'schemaLocalBusiness'},
          ],
        }),
      ],
      validation: (Rule) =>
        Rule.custom((value) => {
          if (!value) return true

          if (value.type && !value.reference) {
            return 'Select a schema reference to match the JSON-LD type'
          }

          if (!value.type && value.reference) {
            return 'Choose a JSON-LD type to match the selected reference'
          }

          return true
        }),
    }),
  ],
})
