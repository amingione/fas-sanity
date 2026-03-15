import {defineField} from 'sanity'

export const legacyCustomProductOptionCustomObjectType = defineField({
  name: 'customProductOption.customObject',
  title: 'Custom Choice (Legacy)',
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
