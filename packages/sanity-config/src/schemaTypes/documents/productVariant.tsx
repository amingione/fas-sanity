import {defineField, defineType} from 'sanity'

export const productVariantType = defineType({
  name: 'productVariant',
  title: 'Product Variant',
  type: 'document',
  description: 'Content-only variant enrichment tied to a Medusa variant.',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'description', type: 'portableTextSimple'}),
    defineField({
      name: 'images',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
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
    }),
    defineField({name: 'medusaVariantId', type: 'string', readOnly: true, validation: (Rule) => Rule.required()}),
    defineField({name: 'lastSyncedFromMedusa', type: 'datetime', readOnly: true}),
  ],
})
