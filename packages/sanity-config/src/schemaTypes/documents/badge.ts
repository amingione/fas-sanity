import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'badge',
  title: 'Badge',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'definition', type: 'badgeType', validation: (Rule) => Rule.required()}),
    defineField({name: 'appliesToProducts', type: 'array', of: [{type: 'reference', to: [{type: 'product'}]}]}),
    defineField({name: 'active', type: 'boolean', initialValue: true}),
  ],
})
