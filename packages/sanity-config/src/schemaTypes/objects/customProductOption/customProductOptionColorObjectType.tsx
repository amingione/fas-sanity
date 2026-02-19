import {defineField} from 'sanity'

const ColorPreview = ({color}: {color: string}) => (
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

export const customProductOptionColorObjectType = defineField({
  name: 'customProductOptionColorObject',
  title: 'Color Choice',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'color',
      type: 'string',
      title: 'Hex Color',
      validation: (Rule) =>
        Rule.required()
          .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
          .error('Enter a valid hex color like #FF0000'),
    }),
    defineField({name: 'description', type: 'string'}),
  ],
  preview: {
    select: {color: 'color', title: 'title'},
    prepare({color, title}) {
      return {title, subtitle: color, media: <ColorPreview color={color} />}
    },
  },
})
