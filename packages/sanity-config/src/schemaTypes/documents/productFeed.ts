import {BasketIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export const productFeedType = defineType({
  name: 'productFeed',
  title: 'Marketplace Product Feed',
  type: 'document',
  icon: BasketIcon,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'product',
      type: 'reference',
      to: [{type: 'product'}],
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'gtin',
      title: 'GTIN',
      type: 'string',
    }),
    defineField({
      name: 'mpn',
      title: 'MPN',
      type: 'string',
    }),
    defineField({
      name: 'brand',
      type: 'string',
    }),
    defineField({
      name: 'price',
      type: 'number',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'currency',
      type: 'string',
      initialValue: 'USD',
    }),
    defineField({
      name: 'availability',
      type: 'string',
      options: {
        list: [
          {title: 'In stock', value: 'in_stock'},
          {title: 'Out of stock', value: 'out_of_stock'},
          {title: 'Preorder', value: 'preorder'},
        ],
      },
      initialValue: 'in_stock',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'price',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? `$${subtitle}` : 'Marketplace feed entry',
      }
    },
  },
})
