import {defineField, defineType} from 'sanity'
import {PackageIcon} from '@sanity/icons'

export default defineType({
  name: 'savedPackage',
  title: 'Saved Packages',
  type: 'document',
  icon: PackageIcon,
  fields: [
    defineField({
      name: 'packageName',
      title: 'Package Name',
      type: 'string',
      validation: (Rule) => Rule.required().max(50),
    }),
    defineField({
      name: 'packageType',
      title: 'Package Type',
      type: 'string',
      options: {
        list: [
          {title: 'Box', value: 'Box'},
          {title: 'Envelope', value: 'Envelope'},
          {title: 'Pak', value: 'Pak'},
          {title: 'Tube', value: 'Tube'},
          {title: 'Custom', value: 'Custom'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'dimensions',
      title: 'Dimensions',
      type: 'object',
      fields: [
        defineField({
          name: 'length',
          title: 'Length (inches)',
          type: 'number',
          validation: (Rule) => Rule.required().min(0.1).max(108),
        }),
        defineField({
          name: 'width',
          title: 'Width (inches)',
          type: 'number',
          validation: (Rule) => Rule.required().min(0.1).max(108),
        }),
        defineField({
          name: 'height',
          title: 'Height (inches)',
          type: 'number',
          validation: (Rule) => Rule.required().min(0.1).max(108),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'weight',
      title: 'Typical Weight (lbs)',
      type: 'number',
      validation: (Rule) => Rule.min(0.1).max(150),
    }),
  ],
  preview: {
    select: {
      title: 'packageName',
      type: 'packageType',
      dimensions: 'dimensions',
    },
    prepare({title, type, dimensions}) {
      const dims = dimensions
        ? `${dimensions.length}x${dimensions.width}x${dimensions.height}"`
        : ''
      return {
        title,
        subtitle: `${type} ${dims}`.trim(),
      }
    },
  },
})
