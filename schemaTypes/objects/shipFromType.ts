import { defineType, defineField } from 'sanity'
import MapboxAddressInput from '../../components/studio/MapboxAddressInput'

export const shipFromAddressType = defineType({
  name: 'shipFromAddress',
  title: 'Ship From',
  type: 'object',
  fields: [
    defineField({ name: 'name', title: 'Name', type: 'string' }),
    defineField({ name: 'phone', title: 'Phone', type: 'string' }),
    defineField({ name: 'address_line1', title: 'Address 1', type: 'string', validation: (Rule) => Rule.required(), components: { input: MapboxAddressInput } }),
    defineField({ name: 'address_line2', title: 'Address 2', type: 'string' }),
    defineField({ name: 'city_locality', title: 'City', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'state_province', title: 'State', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'postal_code', title: 'Postal Code', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'country_code', title: 'Country', type: 'string', initialValue: 'US', validation: (Rule) => Rule.required() }),
  ],
  initialValue: {
    name: 'FAS Motorsports',
    address_line1: '6161 Riverside Dr',
    city_locality: 'Punta Gorda',
    state_province: 'FL',
    postal_code: '33982',
    country_code: 'US',
  },
})
