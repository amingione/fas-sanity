import pluralize from 'pluralize-esm'
import {defineField} from 'sanity'

interface SizeOption {
  title: string
}

export const customProductOptionSizeType = defineField({
  name: 'customProductOption.size',
  title: 'Size',
  type: 'object',
  icon: false,
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
      name: 'sizes',
      type: 'array',
      of: [{type: 'customProductOption.sizeObject'}],
      validation: (Rule) =>
        Rule.min(1)
          .error('Add at least one size choice')
          .custom((options: SizeOption[] | undefined) => {
            // Each size must have a unique title
            if (options) {
              const uniqueTitles = new Set(options.map((option) => option.title))
              if (options.length > uniqueTitles.size) {
                return 'Each product option must have a unique title'
              }
            }
            return true
          }),
    }),
  ],
  preview: {
    select: {
      sizes: 'sizes',
      title: 'title',
      required: 'required',
    },
    prepare({sizes, title, required}: {sizes: any[]; title?: string; required?: boolean}) {
      const pieces = [sizes.length > 0 ? pluralize('size', sizes.length, true) : 'No sizes']
      pieces.push(required === false ? 'Optional' : 'Required')
      return {
        subtitle: pieces.join(' • '),
        title,
      }
    },
  },
})
