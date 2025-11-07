import pluralize from 'pluralize-esm'
import {defineField} from 'sanity'

interface CustomOptionValue {
  title: string
  value?: string
}

export const customProductOptionCustomType = defineField({
  name: 'customProductOption.custom',
  title: 'Custom Option',
  type: 'object',
  options: {collapsible: true, collapsed: false},
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Display name for this option (e.g., Material, Finish, Bundle)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'required',
      type: 'boolean',
      title: 'Required',
      description: 'Customers must select a value before adding this product to the cart.',
      initialValue: true,
    }),
    defineField({
      name: 'values',
      title: 'Choices',
      type: 'array',
      of: [{type: 'customProductOption.customObject'}],
      validation: (Rule) =>
        Rule.min(1)
          .error('Add at least one choice')
          .custom((options: CustomOptionValue[] | undefined) => {
            if (options) {
              const uniqueTitles = new Set(
                options.map((option) => option?.title?.trim()?.toLowerCase()).filter(Boolean)
              )
              if (options.length > uniqueTitles.size) {
                return 'Each choice must have a unique label'
              }
            }
            return true
          }),
    }),
  ],
  preview: {
    select: {
      values: 'values',
      title: 'title',
      required: 'required',
    },
    prepare({values, title, required}: {values?: unknown; title?: string; required?: boolean}) {
      const list = Array.isArray(values) ? values : []
      const count = list.length
      const pieces = [count ? pluralize('choice', count, true) : 'No choices']
      pieces.push(required === false ? 'Optional' : 'Required')
      return {
        subtitle: pieces.join(' • '),
        title: title || 'Custom Option',
      }
    },
  },
})
