import {SearchIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export const globalSeoType = defineType({
  name: 'globalSeo',
  title: 'Global SEO',
  type: 'document',
  icon: SearchIcon,
  groups: [
    {
      name: 'metadata',
      title: 'Metadata',
      default: true,
    },
    {
      name: 'structuredData',
      title: 'Structured data',
    },
    {
      name: 'social',
      title: 'Social defaults',
    },
  ],
  fields: [
    defineField({
      name: 'siteName',
      title: 'Site name',
      type: 'string',
      description: 'Used as a fallback for structured data and title construction.',
      group: 'metadata',
    }),
    defineField({
      name: 'defaultSeo',
      title: 'Default SEO metadata',
      type: 'seo',
      group: 'metadata',
    }),
    defineField({
      name: 'metaKeywords',
      title: 'Fallback keywords',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Optional keywords to sprinkle into generated metadata when nothing else is provided.',
      group: 'metadata',
    }),
    defineField({
      name: 'jsonLd',
      title: 'Global JSON-LD',
      type: 'text',
      rows: 8,
      description: 'Site-wide schema that should be injected on every page (organisation, breadcrumbs, etc.).',
      group: 'structuredData',
    }),
    defineField({
      name: 'openGraphDefaults',
      title: 'Open Graph defaults',
      type: 'object',
      group: 'social',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        defineField({
          name: 'siteHandle',
          title: 'Site social handle',
          type: 'string',
          description: 'Twitter/X or Threads handle (e.g. @fasmotorsports).',
        }),
        defineField({
          name: 'image',
          title: 'Default Open Graph image',
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'alt',
              title: 'Alt text',
              type: 'string',
              description: 'Accessible description used when no document-specific alt text is present.',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'lastRefreshed',
      title: 'Last refreshed',
      type: 'datetime',
      readOnly: true,
      description: 'Updated automatically when scripts regenerate sitewide SEO.',
      group: 'metadata',
    }),
  ],
  preview: {
    select: {
      title: 'siteName',
      subtitle: 'defaultSeo.metaTitle',
      media: 'defaultSeo.openGraph.image',
    },
    prepare({title, subtitle, media}) {
      return {
        title: title || 'Global SEO defaults',
        subtitle: subtitle || 'Site-wide metadata and structured data',
        media,
      }
    },
  },
})
