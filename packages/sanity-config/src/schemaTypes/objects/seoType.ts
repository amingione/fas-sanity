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
      name: 'title',
      title: 'Meta title',
      type: 'string',
      validation: (Rule) =>
        Rule.max(60).warning('Longer titles may be truncated by search engines'),
    }),
    defineField({
      name: 'description',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      validation: (Rule) =>
        Rule.max(160).warning('Longer descriptions may be truncated by search engines'),
    }),
    defineField({
      name: 'image',
      title: 'Default share image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'canonicalUrl',
      title: 'Canonical URL',
      type: 'url',
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
      title: 'JSON-LD',
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
