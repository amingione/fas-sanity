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
    },
    prepare({values, title}: {values?: unknown; title?: string}) {
      const list = Array.isArray(values) ? values : []
      const count = list.length
      return {
        subtitle: count ? pluralize('choice', count, true) : 'No choices',
        title: title || 'Custom Option',
      }
    },
  },
})
