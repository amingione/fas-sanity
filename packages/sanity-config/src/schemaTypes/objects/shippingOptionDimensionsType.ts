import { defineType, defineField } from 'sanity'

export const shippingOptionDimensionsType = defineType({
  name: 'shippingOptionDimensions',
  title: 'Dimensions',
  type: 'object',
  fields: [
    defineField({ name: 'length', type: 'number' }),
    defineField({ name: 'width', type: 'number' }),
    defineField({ name: 'height', type: 'number' }),
    defineField({ name: 'unit', type: 'string', initialValue: 'inch' }),
  ],
})

