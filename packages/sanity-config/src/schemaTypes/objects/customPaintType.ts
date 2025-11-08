import {defineType, defineField} from 'sanity'

export const customPaintType = defineType({
  name: 'customPaint',
  title: 'Custom Paint',
  type: 'object',
  fields: [
    defineField({
      name: 'enabled',
      title: 'Offer Custom Paint?',
      type: 'boolean',
      initialValue: false,
      description: 'Toggle to offer paint while the item is in the shop.',
    }),
    defineField({
      name: 'additionalPrice',
      title: 'Additional Price ($)',
      type: 'number',
      description: 'Price added when customer selects paint.',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'paintCodeRequired',
      title: 'Require Paint Code',
      type: 'boolean',
      initialValue: true,
      description: 'If enabled, the customer must enter a valid paint code before adding to cart.',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'codeLabel',
      title: 'Paint Code Field Label',
      type: 'string',
      initialValue: 'OEM Paint Code',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'instructions',
      title: 'Paint Code Instructions',
      type: 'text',
      rows: 3,
      description:
        'Explain accepted formats (e.g., OEM code), where to find it, and any limitations (pearls, candy, multi-stage, etc.).',
      hidden: ({parent}) => !parent?.enabled,
    }),
  ],
})
