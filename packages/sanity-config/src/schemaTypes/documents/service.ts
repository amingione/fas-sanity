import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'service',
  title: 'Service',
  type: 'document',
  groups: [
    {name: 'overview', title: 'Overview', default: true},
    {name: 'logistics', title: 'Logistics'},
    {name: 'compatibility', title: 'Compatibility'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Service title',
      type: 'string',
      validation: (Rule) => Rule.required(),
      group: 'overview',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      group: 'overview',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
      group: 'overview',
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{type: 'image'}],
      options: {layout: 'grid'},
      group: 'overview',
    }),
    defineField({
      name: 'serviceType',
      title: 'Service Type',
      type: 'string',
      options: {
        list: [
          {title: 'Installation', value: 'installation'},
          {title: 'Tuning', value: 'tuning'},
          {title: 'Repair', value: 'repair'},
          {title: 'Maintenance', value: 'maintenance'},
          {title: 'Diagnostic', value: 'diagnostic'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
      group: 'logistics',
    }),
    defineField({
      name: 'basePrice',
      title: 'Base Price (USD)',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
      group: 'logistics',
    }),
    defineField({
      name: 'estimatedHours',
      title: 'Estimated Hours',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      group: 'logistics',
    }),
    defineField({
      name: 'requiredParts',
      title: 'Required Parts',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      group: 'logistics',
    }),
    defineField({
      name: 'compatibleVehicles',
      title: 'Compatible Vehicles',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [
            {type: 'vehicleModel'},
            {type: 'vehicle'},
          ],
        },
      ],
      group: 'compatibility',
    }),
    defineField({
      name: 'sourceProductId',
      title: 'Source Product',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'serviceType',
      media: 'images.0',
      price: 'basePrice',
    },
    prepare({title, subtitle, media, price}) {
      const priceLabel =
        typeof price === 'number'
          ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(price)
          : null
      return {
        title,
        subtitle: [subtitle, priceLabel].filter(Boolean).join(' • '),
        media,
      }
    },
  },
})
