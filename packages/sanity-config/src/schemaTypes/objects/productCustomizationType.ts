import {defineType, defineField} from 'sanity'

export const productCustomizationType = defineType({
  name: 'productCustomization',
  title: 'Customization',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Field label',
      description: 'Shown to customers when asking for personalization details.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 2,
      title: 'Helper text',
      description:
        'Explain how the customization will be used (e.g. engraving text, initials, etc.).',
    }),
    defineField({
      name: 'inputType',
      type: 'string',
      title: 'Input type',
      description: 'Controls how the storefront collects the customization.',
      options: {
        list: [
          {title: 'Single line text', value: 'text'},
          {title: 'Paragraph', value: 'textarea'},
          {title: 'Number', value: 'number'},
        ],
        layout: 'radio',
      },
      initialValue: 'text',
    }),
    defineField({
      name: 'required',
      type: 'boolean',
      title: 'Required',
      description: 'When enabled the customer must provide a value before adding to cart.',
      initialValue: false,
    }),
    defineField({
      name: 'maxLength',
      type: 'number',
      title: 'Maximum length',
      description: 'Optional limit for text-based inputs.',
      validation: (Rule) =>
        Rule.min(1)
          .max(500)
          .warning('Values above 500 characters may not be supported by checkout providers.'),
      hidden: ({parent}) => parent?.inputType === 'number',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      required: 'required',
      inputType: 'inputType',
    },
    prepare({
      title,
      required,
      inputType,
    }: {
      title?: string
      required?: boolean
      inputType?: string
    }) {
      const subtitleParts = [
        inputType === 'textarea' ? 'Paragraph' : inputType === 'number' ? 'Number' : 'Text',
      ]
      if (required) subtitleParts.push('Required')
      return {
        title: title || 'Customization',
        subtitle: subtitleParts.join(' • '),
      }
    },
  },
})
