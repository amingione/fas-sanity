import {defineType, defineField} from 'sanity'
import MapboxAddressInput from '../../components/studio/MapboxAddressInput'

export const shipToType = defineType({
  name: 'shipTo',
  title: 'Ship To',
  type: 'object',
  fields: [
    defineField({name: 'name', title: 'Name', type: 'string'}),
    defineField({name: 'email', title: 'Email', type: 'string'}),
    defineField({name: 'phone', title: 'Phone', type: 'string'}),
    defineField({
      name: 'address_line1',
      title: 'Address 1',
      type: 'string',
      components: {input: MapboxAddressInput},
    }),
    defineField({name: 'address_line2', title: 'Address 2', type: 'string'}),
    defineField({name: 'city_locality', title: 'City', type: 'string'}),
    defineField({name: 'state_province', title: 'State/Province', type: 'string'}),
    defineField({name: 'postal_code', title: 'Postal Code', type: 'string'}),
    defineField({name: 'country_code', title: 'Country Code', type: 'string'}),
  ],
})
