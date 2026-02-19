import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'orderEmailTemplate',
  title: 'Order Email Template',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'trigger', type: 'string', options: {list: ['order_placed', 'order_shipped', 'order_delivered', 'order_refunded']}, validation: (Rule) => Rule.required()}),
    defineField({name: 'subject', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'preheader', type: 'string'}),
    defineField({name: 'blocks', type: 'array', of: [{type: 'templateBlockType'}]}),
    defineField({name: 'isDefault', type: 'boolean', initialValue: false}),
  ],
})
