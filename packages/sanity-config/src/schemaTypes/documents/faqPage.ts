import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'faqPage',
  title: 'FAQ Page',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}}),
    defineField({name: 'intro', type: 'portableTextSimple'}),
    defineField({name: 'items', type: 'array', of: [{type: 'faqItemType'}], validation: (Rule) => Rule.min(1)}),
    defineField({name: 'enableSchemaOrg', type: 'boolean', initialValue: true}),
  ],
})
