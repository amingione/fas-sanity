import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'wooProduct',
  title: 'Woo Product',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96
      }
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'array',
      of: [{ type: 'block' }]
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'number'
    }),
    defineField({
      name: 'salePrice',
      title: 'Sale Price',
      type: 'number'
    }),
    defineField({
      name: 'onSale',
      title: 'On Sale?',
      type: 'boolean'
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string'
    }),
    defineField({
      name: 'inventory',
      title: 'Inventory',
      type: 'number'
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image' }]
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{ type: 'string' }]
    }),
    defineField({
      name: 'featured',
      title: 'Featured Product',
      type: 'boolean'
    })
  ]
})