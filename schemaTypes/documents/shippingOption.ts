import { defineType } from 'sanity'

export default defineType({
  name: 'shippingOption',
  title: 'Shipping Option',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Option Name',
      type: 'string',
    },
    {
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
    },
    {
      name: 'cost',
      title: 'Cost',
      type: 'number',
    },
    {
      name: 'estimatedDelivery',
      title: 'Estimated Delivery Time',
      type: 'string',
    },
    {
      name: 'regionsAvailable',
      title: 'Available Regions',
      type: 'array',
      of: [{ type: 'string' }],
    }
  ]
})
