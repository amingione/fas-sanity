import {defineType, defineField} from 'sanity'

export const packageDetailsType = defineType({
  name: 'packageDetails',
  title: 'Package Details',
  type: 'object',
  fields: [
    defineField({name: 'weight', title: 'Weight', type: 'shipmentWeight'}),
    defineField({name: 'dimensions', title: 'Dimensions', type: 'shippingOptionDimensions'}),
  ],
})
