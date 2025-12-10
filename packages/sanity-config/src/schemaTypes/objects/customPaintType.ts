import React from 'react'
import {defineType, defineField} from 'sanity'

export const customPaintType = defineType({
  name: 'customPaint',
  title: 'Custom Coating Options',
  type: 'object',
  fields: [
    defineField({
      name: 'enabled',
      title: 'Offer Custom Paint/Powder Coating?',
      type: 'boolean',
      description: 'Show powder coating as an optional add-on.',
      initialValue: false,
    }),
    defineField({
      name: 'label',
      title: 'Checkbox Label',
      type: 'string',
      description: 'Text shown next to the checkbox.',
      placeholder: 'Add Powder Coating',
      initialValue: 'Add Powder Coating',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'price',
      title: 'Powder Coating Price',
      type: 'number',
      description: 'Additional cost for powder coating.',
      placeholder: '299',
      validation: (Rule) => Rule.min(0).precision(2),
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
      description: 'Explain the powder coating option to customers.',
      placeholder: 'Professional powder coating in your choice of color.',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'paintCodeFieldLabel',
      title: 'Paint Code Field Label',
      type: 'string',
      description: 'Label for the paint code input (shown after checkbox is selected).',
      placeholder: 'Paint Code',
      initialValue: 'Paint Code',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'paintCodeInstructions',
      title: 'Paint Code Instructions',
      type: 'text',
      rows: 3,
      description: 'Help text shown when customer selects powder coating.',
      placeholder: 'Enter your RAL, Pantone, or custom color code. Contact us if you need help choosing.',
      hidden: ({parent}) => !parent?.enabled,
    }),
    defineField({
      name: 'colorSwatches',
      title: 'Popular Color Swatches (Optional)',
      type: 'array',
      description: 'Show quick-select color options.',
      hidden: ({parent}) => !parent?.enabled,
      of: [
        defineField({
          name: 'colorSwatch',
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              type: 'string',
              title: 'Color Name',
              placeholder: 'Gloss Black',
            }),
            defineField({
              name: 'code',
              type: 'string',
              title: 'Paint Code',
              placeholder: 'RAL 9005',
            }),
            defineField({
              name: 'hexColor',
              type: 'string',
              title: 'Hex Color',
              placeholder: '#000000',
            }),
          ],
          preview: {
            select: {name: 'name', code: 'code', hex: 'hexColor'},
            prepare({name, code, hex}) {
              return {
                title: name || 'Unnamed color',
                subtitle: code || 'No code',
                media: hex
                  ? React.createElement('div', {
                      style: {
                        width: 32,
                        height: 32,
                        borderRadius: 4,
                        border: '1px solid #d1d5db',
                        backgroundColor: hex,
                      },
                    })
                  : undefined,
              }
            },
          },
        }),
      ],
    }),
  ],
})
