import {defineField, defineType} from 'sanity'

export const productBundle = defineType({
  name: 'productBundle',
  title: 'Product Bundle',
  type: 'document',
  description: 'Merchandising bundle content only. Bundle pricing is owned by Medusa.',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'description', type: 'portableText'}),
    defineField({name: 'tagline', type: 'string'}),
    defineField({name: 'featuredImage', type: 'image', options: {hotspot: true}}),
    defineField({
      name: 'products',
      title: 'Included Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
    }),
    defineField({name: 'contentStatus', type: 'string', options: {list: ['draft', 'review', 'published']}, initialValue: 'draft'}),
  ],
})
