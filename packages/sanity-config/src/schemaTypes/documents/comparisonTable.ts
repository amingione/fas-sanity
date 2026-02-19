import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'comparisonTable',
  title: 'Comparison Table',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'columns', type: 'array', of: [{type: 'string'}], validation: (Rule) => Rule.min(2)}),
    defineField({name: 'rows', type: 'array', of: [{type: 'comparisonRowType'}]}),
    defineField({name: 'notes', type: 'portableTextSimple'}),
  ],
})
