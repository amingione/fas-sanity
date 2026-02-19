import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'brandAsset',
  title: 'Brand Asset',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'assetType', type: 'string', options: {list: ['logo', 'color-token', 'typography', 'voice-guideline', 'partner-mark']}, validation: (Rule) => Rule.required()}),
    defineField({name: 'description', type: 'text'}),
    defineField({name: 'image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'file', type: 'file'}),
    defineField({name: 'active', type: 'boolean', initialValue: true}),
  ],
})
