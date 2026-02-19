import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'redirect',
  title: 'Redirect',
  type: 'document',
  fields: [
    defineField({name: 'from', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'to', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'statusCode', type: 'number', initialValue: 301, validation: (Rule) => Rule.required().valid(301, 302, 307, 308)}),
    defineField({name: 'active', type: 'boolean', initialValue: true}),
    defineField({name: 'notes', type: 'text', rows: 2}),
  ],
})
