import {defineField} from 'sanity'

const ColorPreview = ({color}: {color: string}) => {
  return (
    <div
      style={{
        backgroundColor: color,
        borderRadius: 'inherit',
        display: 'flex',
        height: '100%',
        width: '100%',
      }}
    />
  )
}

export const customProductOptionColorObjectType = defineField({
  name: 'customProductOption.colorObject',
  title: 'Color',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Shopify product option value (case sensitive)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'color',
      type: 'string',
      title: 'Hex color',
      description: 'Hex value like #RRGGBB or #RGB',
      validation: (Rule) =>
        Rule.required()
          .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, {name: 'hex color', invert: false})
          .error('Enter a valid hex color like #FF0000 or #F00'),
    }),
  ],
  preview: {
    select: {
      color: 'color',
      title: 'title',
    },
    prepare({color, title}) {
      return {
        media: <ColorPreview color={color} />,
        subtitle: color,
        title,
      }
    },
  },
})
