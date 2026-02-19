import {defineField, defineType} from 'sanity'

export const comparisonRowType = defineType({
  name: 'comparisonRowType',
  title: 'Comparison Row',
  type: 'object',
  fields: [
    defineField({name: 'label', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'values', type: 'array', of: [{type: 'string'}], validation: (Rule) => Rule.required()}),
  ],
})
