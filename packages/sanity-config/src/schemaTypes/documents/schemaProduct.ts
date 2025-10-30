import {defineArrayMember, defineField, defineType} from 'sanity'

export const schemaProductType = defineType({
  name: 'schemaProduct',
  title: 'Schema.org Product',
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
      title: 'Product URL',
      type: 'url',
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string',
    }),
    defineField({
      name: 'mpn',
      title: 'MPN',
      type: 'string',
    }),
    defineField({
      name: 'gtin',
      title: 'GTIN',
      type: 'string',
    }),
    defineField({
      name: 'brand',
      title: 'Brand',
      type: 'string',
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [defineArrayMember({type: 'image'})],
    }),
    defineField({
      name: 'offers',
      title: 'Offers',
      type: 'array',
      of: [
        defineArrayMember({
          name: 'offer',
          title: 'Offer',
          type: 'object',
          fields: [
            defineField({
              name: 'price',
              title: 'Price',
              type: 'number',
            }),
            defineField({
              name: 'priceCurrency',
              title: 'Currency',
              type: 'string',
            }),
            defineField({
              name: 'availability',
              title: 'Availability',
              type: 'string',
              description: 'Use Schema.org availability codes, e.g. https://schema.org/InStock',
            }),
            defineField({
              name: 'url',
              title: 'Offer URL',
              type: 'url',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'aggregateRating',
      title: 'Aggregate rating',
      type: 'object',
      fields: [
        defineField({
          name: 'ratingValue',
          title: 'Rating value',
          type: 'number',
        }),
        defineField({
          name: 'reviewCount',
          title: 'Review count',
          type: 'number',
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'name',
    },
    prepare({title}) {
      return {
        title: title || 'Product schema',
      }
    },
  },
})
