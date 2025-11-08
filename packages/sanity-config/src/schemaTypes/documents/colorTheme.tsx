import {IceCreamIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import ColorTheme from '../../components/media/ColorTheme'

export const colorThemeType = defineType({
  name: 'colorTheme',
  title: 'Color theme',
  type: 'document',
  icon: IceCreamIcon,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'text',
      type: 'string',
      title: 'Text color',
      description: 'Hex color like #000000',
      validation: (Rule) =>
        Rule.required()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, {name: 'hex color'})
          .error('Enter a valid hex color, e.g. #000000'),
    }),
    defineField({
      name: 'background',
      type: 'string',
      title: 'Background color',
      description: 'Hex color like #FFFFFF',
      validation: (Rule) =>
        Rule.required()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, {name: 'hex color'})
          .error('Enter a valid hex color, e.g. #FFFFFF'),
    }),
  ],
  preview: {
    select: {
      backgroundColor: 'background',
      textColor: 'text',
      title: 'title',
    },
    prepare({backgroundColor, textColor, title}) {
      return {
        media: <ColorTheme background={backgroundColor} text={textColor} />,
        subtitle: `${textColor || '(No color)'} / ${backgroundColor || '(No color)'}`,
        title,
      }
    },
  },
})
