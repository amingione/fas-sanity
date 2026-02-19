import {defineField} from 'sanity'

export const customProductOptionSizeObjectType = defineField({
  name: 'customProductOptionSizeObject',
  title: 'Size Choice',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'description', type: 'string'}),
  ],
  preview: {
    select: {title: 'title'},
  },
})
