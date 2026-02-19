import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'invoiceTemplate',
  title: 'Invoice Template',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'headerBlocks', type: 'array', of: [{type: 'templateBlockType'}]}),
    defineField({name: 'footerBlocks', type: 'array', of: [{type: 'templateBlockType'}]}),
    defineField({name: 'isDefault', type: 'boolean', initialValue: false}),
  ],
})
