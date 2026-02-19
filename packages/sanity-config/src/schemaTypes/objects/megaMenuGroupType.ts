import {defineField, defineType} from 'sanity'

export const megaMenuGroupType = defineType({
  name: 'megaMenuGroupType',
  title: 'Mega Menu Group',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'links', type: 'array', of: [{type: 'linkInternal'}, {type: 'linkExternal'}]}),
    defineField({name: 'ctaLabel', type: 'string'}),
    defineField({name: 'ctaLink', type: 'linkExternal'}),
    defineField({name: 'image', type: 'image', options: {hotspot: true}}),
  ],
})
