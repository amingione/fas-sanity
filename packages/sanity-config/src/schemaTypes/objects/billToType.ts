import {defineType, defineField} from 'sanity'

export const billToType = defineType({
  name: 'billTo',
  title: 'Bill To',
  type: 'object',
  fields: [
    defineField({name: 'name', type: 'string', title: 'Name'}),
    defineField({name: 'email', type: 'string', title: 'Email'}),
    defineField({name: 'phone', type: 'string', title: 'Phone'}),
    defineField({name: 'address_line1', type: 'string', title: 'Address Line 1'}),
    defineField({name: 'address_line2', type: 'string', title: 'Address Line 2'}),
    defineField({name: 'city_locality', type: 'string', title: 'City'}),
    defineField({name: 'state_province', type: 'string', title: 'State/Province'}),
    defineField({name: 'postal_code', type: 'string', title: 'Postal Code'}),
    defineField({name: 'country_code', type: 'string', title: 'Country Code'}),
  ],
})
