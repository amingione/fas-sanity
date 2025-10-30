import {defineField} from 'sanity'

export const schemaPostalAddressType = defineField({
  name: 'schemaPostalAddress',
  title: 'Postal address',
  type: 'object',
  fields: [
    defineField({
      name: 'streetAddress',
      title: 'Street address',
      type: 'string',
    }),
    defineField({
      name: 'addressLocality',
      title: 'City / Locality',
      type: 'string',
    }),
    defineField({
      name: 'addressRegion',
      title: 'State / Region',
      type: 'string',
    }),
    defineField({
      name: 'postalCode',
      title: 'Postal code',
      type: 'string',
    }),
    defineField({
      name: 'addressCountry',
      title: 'Country',
      type: 'string',
    }),
  ],
})
