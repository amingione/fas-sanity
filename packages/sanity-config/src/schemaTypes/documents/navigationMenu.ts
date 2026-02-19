import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'navigationMenu',
  title: 'Navigation Menu',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'location', type: 'string', options: {list: ['header', 'footer', 'mega-menu', 'mobile']}, validation: (Rule) => Rule.required()}),
    defineField({name: 'links', type: 'array', of: [{type: 'linkInternal'}, {type: 'linkExternal'}, {type: 'linkProduct'}]}),
    defineField({name: 'megaMenuGroups', type: 'array', of: [{type: 'megaMenuGroupType'}]}),
    defineField({name: 'active', type: 'boolean', initialValue: true}),
  ],
})
