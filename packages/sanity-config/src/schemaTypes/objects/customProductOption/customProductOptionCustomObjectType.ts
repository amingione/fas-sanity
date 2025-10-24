import {defineField} from 'sanity'

export const customProductOptionCustomObjectType = defineField({
  name: 'customProductOption.customObject',
  title: 'Custom Option Choice',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Label',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'value',
      type: 'string',
      title: 'Value override',
      description: 'Optional value to send to the storefront/checkout; defaults to the label.',
    }),
  ],
  preview: {
    select: {title: 'title', value: 'value'},
    prepare({title, value}: {title?: string; value?: string}) {
      return {
        title: title || 'Choice',
        subtitle: value && value !== title ? value : undefined,
      }
    },
  },
})
