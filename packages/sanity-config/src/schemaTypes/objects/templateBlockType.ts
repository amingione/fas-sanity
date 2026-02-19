import {defineField, defineType} from 'sanity'

export const templateBlockType = defineType({
  name: 'templateBlockType',
  title: 'Template Block',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'body', type: 'portableTextSimple'}),
  ],
})
