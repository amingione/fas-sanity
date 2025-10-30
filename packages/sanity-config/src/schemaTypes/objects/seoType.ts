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
      name: 'openGraph',
      title: 'Open Graph',
      type: 'object',
      options: {
        collapsible: true,
        collapsed: true,
      },
      fields: [
        defineField({
          name: 'image',
          title: 'Preview image',
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'alt',
              title: 'Alt text',
              type: 'string',
              description: 'Short, keyword-rich description for screen readers and social previews.',
            }),
          ],
        }),
        defineField({
          name: 'url',
          title: 'Open Graph URL',
          type: 'url',
          description: 'Explicit share URL for social previews when different from the canonical link.',
        }),
      ],
    }),
    defineField({
      name: 'canonicalUrl',
      title: 'Canonical URL',
      type: 'url',
      description: 'Preferred URL for search engines when duplicate content exists.',
    }),
    defineField({
      name: 'jsonLd',
      title: 'Structured data (JSON-LD)',
      type: 'text',
      rows: 6,
      description: 'Paste raw JSON-LD to enhance search engine rich results.',
    }),
  ],
})
