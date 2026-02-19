import {defineField, defineType} from 'sanity'

export const faqItemType = defineType({
  name: 'faqItemType',
  title: 'FAQ Item',
  type: 'object',
  fields: [
    defineField({name: 'question', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'answer', type: 'portableTextSimple', validation: (Rule) => Rule.required()}),
  ],
})
