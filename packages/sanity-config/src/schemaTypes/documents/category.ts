import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mpnPrefix',
      title: 'MPN Prefix',
      type: 'string',
      description: '3-6 letter code used when auto-generating SKUs/MPNs.',
      options: {
        list: [
          {title: 'Hellcat platform', value: 'HC'},
          {title: 'Ram TRX', value: 'TRX'},
          {title: 'Trackhawk', value: 'THWK'},
          {title: 'Universal part', value: 'UNI'},
          {title: 'Pulleys', value: 'PUL'},
          {title: 'Supercharger snouts', value: 'SNOUT'},
          {title: 'Intakes', value: 'INTK'},
          {title: 'Build packages', value: 'PKG'},
          {title: 'Electronics / sensors', value: 'ELEC'},
          {title: 'Fuel system', value: 'FUEL'},
          {title: 'Cooling components', value: 'COOL'},
        ],
      },
      validation: (Rule) =>
        Rule.required()
          .min(2)
          .max(6)
          .regex(/^[A-Z0-9]+$/, {name: 'uppercase code'})
          .error('MPN prefix is required (use uppercase letters/numbers).'),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
      description: 'Displayed for this category on the storefront.',
    }),
    // Optional curated list of products for this category.
    // This matches existing documents that already have a `products` array of product references
    // and prevents Studio from showing an "Unknown field" warning.
    defineField({
      name: 'products',
      title: 'Products (curated)',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description:
        'Optional curated list of products for this category. Products also reference categories themselves.',
    }),
  ],
})
