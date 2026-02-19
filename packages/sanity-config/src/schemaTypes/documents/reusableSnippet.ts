import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'reusableSnippet',
  title: 'Reusable Snippet',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'snippetType', type: 'string', options: {list: ['testimonial', 'trust-badge', 'partner-logo', 'cta', 'custom']}, validation: (Rule) => Rule.required()}),
    defineField({name: 'body', type: 'portableTextSimple'}),
    defineField({name: 'image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'link', type: 'linkExternal'}),
    defineField({name: 'active', type: 'boolean', initialValue: true}),
  ],
})
