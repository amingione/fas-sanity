import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'legalContent',
  title: 'Legal Content',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'contentType', type: 'string', options: {list: ['terms', 'privacy', 'returns', 'warranty', 'other']}, validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'summary', type: 'text'}),
    defineField({name: 'body', type: 'portableText', validation: (Rule) => Rule.required()}),
    defineField({name: 'effectiveDate', type: 'date'}),
  ],
})
