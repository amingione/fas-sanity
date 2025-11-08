import {defineType, defineField} from 'sanity'

export const orderCartItemMetaType = defineType({
  name: 'orderCartItemMeta',
  title: 'Metadata Entry',
  type: 'object',
  fields: [
    defineField({name: 'key', type: 'string', title: 'Key', readOnly: true}),
    defineField({name: 'value', type: 'string', title: 'Value', readOnly: true}),
    defineField({name: 'source', type: 'string', title: 'Source', readOnly: true}),
  ],
  preview: {
    select: {title: 'key', subtitle: 'value'},
  },
})
