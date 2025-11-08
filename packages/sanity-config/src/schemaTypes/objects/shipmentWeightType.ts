import {defineType, defineField} from 'sanity'

export const shipmentWeightType = defineType({
  name: 'shipmentWeight',
  title: 'Weight',
  type: 'object',
  fields: [
    defineField({
      name: 'value',
      title: 'Value',
      type: 'number',
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: 'unit',
      title: 'Unit',
      type: 'string',
      options: {list: ['pound', 'ounce', 'gram', 'kilogram']},
      initialValue: 'pound',
      validation: (Rule) => Rule.required(),
    }),
  ],
})
