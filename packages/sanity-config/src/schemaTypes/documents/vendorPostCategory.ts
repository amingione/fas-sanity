import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorPostCategory',
  title: 'Vendor Post Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'color',
      title: 'Color',
      type: 'string',
      options: {
        list: [
          {title: 'Red', value: '#ef4444'},
          {title: 'Blue', value: '#3b82f6'},
          {title: 'Green', value: '#10b981'},
          {title: 'Yellow', value: '#f59e0b'},
          {title: 'Purple', value: '#8b5cf6'},
        ],
      },
    }),
  ],
})
