import {defineField, defineType} from 'sanity'

export const colorValueType = defineType({
  name: 'colorValue',
  title: 'Color value',
  type: 'object',
  description: 'Simple color model for inline print settings colors',
  fields: [
    defineField({
      name: 'hex',
      title: 'Hex value',
      type: 'string',
      description: 'Hex color in #RRGGBB format',
      validation: (Rule) =>
        Rule.regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, {name: 'hex color'}).error(
          'Enter a valid hex color, e.g. #000000',
        ),
    }),
  ],
})
