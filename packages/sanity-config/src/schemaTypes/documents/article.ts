import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'article',
  title: 'Article',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      readOnly: true,
      deprecated: {
        reason: 'Use the "name" field instead',
      },
      hidden: ({value}) => (value === undefined ? true : false),
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
    }),
  ],
})
