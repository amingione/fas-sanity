import {defineField, defineType} from 'sanity'

export const productVariantType = defineType({
  name: 'productVariant',
  title: 'Product Variant',
  type: 'document',
  description: 'Content-only variant enrichment tied to a Medusa variant. Medusa owns pricing, inventory, and commerce state.',
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'integration', title: 'Medusa Bridge (read-only)'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required(), group: 'content'}),
    defineField({
      name: 'product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
      group: 'content',
    }),
    defineField({name: 'description', type: 'portableTextSimple', group: 'content'}),
    defineField({
      name: 'images',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
      group: 'content',
    }),
    defineField({
      name: 'contentStatus',
      type: 'string',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Review', value: 'review'},
          {title: 'Published', value: 'published'},
        ],
      },
      initialValue: 'draft',
      group: 'content',
    }),
    defineField({
      name: 'medusaVariantId',
      type: 'string',
      readOnly: true,
      description: 'Mirrored from Medusa – read-only. Set automatically by the Medusa → Sanity sync.',
      validation: (Rule) => Rule.required(),
      group: 'integration',
    }),
    defineField({
      name: 'lastSyncedFromMedusa',
      type: 'datetime',
      readOnly: true,
      description: 'Mirrored from Medusa – read-only. Timestamp of the last sync from Medusa.',
      group: 'integration',
    }),
  ],
})
