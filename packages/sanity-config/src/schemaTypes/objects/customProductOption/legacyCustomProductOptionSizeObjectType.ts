import {defineField} from 'sanity'

export const legacyCustomProductOptionSizeObjectType = defineField({
  name: 'customProductOption.sizeObject',
  title: 'Size Choice (Legacy)',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'description', type: 'string'}),
  ],
  preview: {
    select: {title: 'title'},
  },
})
