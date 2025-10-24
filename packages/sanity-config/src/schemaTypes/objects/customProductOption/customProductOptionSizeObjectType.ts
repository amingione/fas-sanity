import {defineField} from 'sanity'

export const customProductOptionSizeObjectType = defineField({
  name: 'customProductOption.sizeObject',
  title: 'Size',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Shopify product option value (case sensitive)',
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
    },
    prepare({title}) {
      return {
        subtitle: undefined,
        title,
      }
    },
  },
})
