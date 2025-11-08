import {defineType, defineField} from 'sanity'

export const attributeType = defineType({
  name: 'attribute',
  title: 'Attribute',
  type: 'object',
  fields: [
    defineField({name: 'name', type: 'string', title: 'Attribute Name'}),
    defineField({name: 'value', type: 'string', title: 'Value'}),
  ],
})
