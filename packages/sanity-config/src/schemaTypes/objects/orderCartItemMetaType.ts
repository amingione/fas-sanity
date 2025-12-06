import {defineType, defineField} from 'sanity'

export const orderCartItemMetaType = defineType({
  name: 'orderCartItemMeta',
  title: 'Metadata Entry',
  type: 'object',
  fields: [
    defineField({name: 'key', type: 'string', title: 'Key', readOnly: false}),
    defineField({name: 'value', type: 'string', title: 'Value', readOnly: false}),
    defineField({name: 'source', type: 'string', title: 'Source', readOnly: false}),
  ],
  preview: {
    select: {title: 'key', subtitle: 'value'},
  },
})
