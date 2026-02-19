import {defineArrayMember, defineField, defineType} from 'sanity'

export default defineType({
  name: 'productTable',
  title: 'Product Table',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'intro', type: 'portableTextSimple'}),
    defineField({
      name: 'columns',
      type: 'array',
      of: [{type: 'string'}],
      validation: (Rule) => Rule.min(2),
    }),
    defineField({
      name: 'rows',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({name: 'label', type: 'string'}),
            defineField({name: 'values', type: 'array', of: [{type: 'string'}]}),
          ],
        }),
      ],
    }),
  ],
})
