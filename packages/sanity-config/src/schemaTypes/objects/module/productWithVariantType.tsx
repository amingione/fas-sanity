import {defineField} from 'sanity'

export const productWithVariantType = defineField({
  name: 'productWithVariant',
  title: 'Product with Variant',
  type: 'object',
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'variant',
      type: 'reference',
      to: [{type: 'productVariant'}],
    }),
  ],
})
