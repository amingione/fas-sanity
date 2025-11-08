import {defineType, defineField} from 'sanity'

export const packageDimensionsType = defineType({
  name: 'packageDimensions',
  title: 'Dimensions (inches)',
  type: 'object',
  fields: [
    defineField({
      name: 'length',
      title: 'Length',
      type: 'number',
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: 'width',
      title: 'Width',
      type: 'number',
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: 'height',
      title: 'Height',
      type: 'number',
      validation: (Rule) => Rule.required().positive(),
    }),
  ],
})
