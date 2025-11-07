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
      name: 'required',
      type: 'boolean',
      title: 'Required',
      description: 'Customers must select a value before adding this product to the cart.',
      initialValue: true,
    }),
    defineField({
      name: 'colors',
      type: 'array',
      of: [{type: 'customProductOption.colorObject'}],
      validation: (Rule) =>
        Rule.min(1)
          .error('Add at least one color choice')
          .custom((options: ColorOption[] | undefined) => {
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
      required: 'required',
    },
    prepare(selection) {
      const {colors, title, required} = selection as {
        colors?: unknown
        title?: string
        required?: boolean
      }
      const list = Array.isArray(colors) ? colors : []
      const count = list.length
      const pieces = [count ? pluralize('color', count, true) : 'No colors']
      pieces.push(required === false ? 'Optional' : 'Required')
      return {
        subtitle: pieces.join(' • '),
        title: title || 'Color options',
      }
    },
  },
})
