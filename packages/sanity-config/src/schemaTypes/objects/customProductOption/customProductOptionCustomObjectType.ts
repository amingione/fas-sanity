import {defineField} from 'sanity'

export const customProductOptionCustomObjectType = defineField({
  name: 'customProductOptionCustomObject',
  title: 'Custom Choice',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'value', type: 'string'}),
    defineField({name: 'description', type: 'string'}),
  ],
  preview: {
    select: {title: 'title', value: 'value'},
    prepare({title, value}) {
      return {title, subtitle: value && value !== title ? value : undefined}
    },
  },
})
