import pluralize from 'pluralize-esm'
import {defineField} from 'sanity'

interface ColorOption {
  title: string
}

export const customProductOptionColorType = defineField({
  name: 'customProductOption.color',
  title: 'Color options',
  type: 'object',
  options: {collapsible: true, collapsed: false},
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Shopify product option name (case sensitive)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'colors',
      type: 'array',
      of: [{type: 'customProductOption.colorObject'}],
      // Allow empty; enforce uniqueness via custom validation
      // (no required rule here)
      validation: (Rule) =>
        Rule.min(0).custom((options: ColorOption[] | undefined) => {
          // Each color must have a unique title
          if (options) {
            const uniqueTitles = new Set((options || []).map((option) => option?.title?.trim()?.toLowerCase()))
            if (options.length > uniqueTitles.size) {
              return 'Each color option must have a unique title'
            }
          }
          return true
        }),
    }),
  ],
  preview: {
    select: {
      colors: 'colors',
      title: 'title',
    },
    prepare(selection) {
      const {colors, title} = selection as {colors?: unknown; title?: string}
      const list = Array.isArray(colors) ? colors : []
      const count = list.length
      return {
        subtitle: count ? pluralize('color', count, true) : 'No colors',
        title: title || 'Color options',
      }
    },
  },
})
