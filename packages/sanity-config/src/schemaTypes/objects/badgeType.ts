import {defineField, defineType} from 'sanity'

export const badgeType = defineType({
  name: 'badgeType',
  title: 'Badge Type',
  type: 'object',
  fields: [
    defineField({name: 'label', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'tone', type: 'string', options: {list: ['default', 'primary', 'positive', 'caution', 'critical']}, initialValue: 'default'}),
    defineField({name: 'icon', type: 'string'}),
    defineField({name: 'conditionNote', type: 'text', rows: 2}),
  ],
})
