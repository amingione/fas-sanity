import {defineType, defineField} from 'sanity'

export const productBundle = defineType({
  name: 'productBundle',
  title: 'Product Bundle',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Bundle Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
    }),
    defineField({
      name: 'products',
      title: 'Products in this Bundle',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
    }),
    defineField({
      name: 'bundlePrice',
      title: 'Bundle Price',
      type: 'number',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'array',
      of: [{type: 'block'}],
    }),
  ],
})
