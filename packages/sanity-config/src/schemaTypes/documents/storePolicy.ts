import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'storePolicy',
  title: 'Store Policy',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'policyType', type: 'string', options: {list: ['shipping', 'returns', 'warranty', 'fulfillment', 'general']}, validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'body', type: 'portableText', validation: (Rule) => Rule.required()}),
    defineField({name: 'effectiveDate', type: 'date'}),
  ],
})
