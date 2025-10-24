import { defineType, defineField } from 'sanity'

export const shippingOptionCustomerAddressType = defineType({
  name: 'shippingOptionCustomerAddress',
  title: 'Customer Address',
  type: 'object',
  fields: [
    defineField({ name: 'name', type: 'string' }),
    defineField({ name: 'address_line1', type: 'string' }),
    defineField({ name: 'city_locality', type: 'string' }),
    defineField({ name: 'state_province', type: 'string' }),
    defineField({ name: 'postal_code', type: 'string' }),
    defineField({ name: 'country_code', type: 'string' }),
  ],
})

