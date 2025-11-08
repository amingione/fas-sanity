import {defineType, defineField} from 'sanity'

export const mediaItemType = defineType({
  name: 'mediaItem',
  title: 'Media Item',
  type: 'object',
  fields: [
    defineField({
      name: 'type',
      type: 'string',
      title: 'Type',
      options: {list: ['video', '3d', 'image', 'pdf']},
    }),
    defineField({name: 'label', type: 'string', title: 'Label'}),
    defineField({name: 'url', type: 'url', title: 'URL'}),
  ],
})
