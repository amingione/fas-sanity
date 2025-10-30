import {defineArrayMember, defineField, defineType} from 'sanity'

export const schemaLocalBusinessType = defineType({
  name: 'schemaLocalBusiness',
  title: 'Schema.org Local Business',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
    defineField({
      name: 'url',
      title: 'Website URL',
      type: 'url',
    }),
    defineField({
      name: 'image',
      title: 'Primary image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'priceRange',
      title: 'Price range',
      type: 'string',
      description: 'For example: $$',
    }),
    defineField({
      name: 'telephone',
      title: 'Telephone',
      type: 'string',
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'email',
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'schemaPostalAddress',
    }),
    defineField({
      name: 'openingHours',
      title: 'Opening hours',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      description: 'Use Schema.org opening hours format, e.g. Mo-Fr 09:00-17:00',
    }),
    defineField({
      name: 'geo',
      title: 'Geo coordinates',
      type: 'object',
      fields: [
        defineField({
          name: 'latitude',
          title: 'Latitude',
          type: 'number',
        }),
        defineField({
          name: 'longitude',
          title: 'Longitude',
          type: 'number',
        }),
      ],
    }),
    defineField({
      name: 'sameAs',
      title: 'Same As profiles',
      type: 'array',
      of: [defineArrayMember({type: 'url'})],
    }),
  ],
  preview: {
    select: {
      title: 'name',
    },
    prepare({title}) {
      return {
        title: title || 'Local business schema',
      }
    },
  },
})
