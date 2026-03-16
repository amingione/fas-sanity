import {defineField, defineType} from 'sanity'

export const addOnType = defineType({
  name: 'addOn',
  title: 'Product Add-On',
  type: 'object',
  fields: [
    defineField({name: 'label', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'priceDelta',
      title: 'Price Add-On (USD)',
      type: 'number',
      description: 'Additional cost in dollars for this add-on (e.g. 75 = +$75.00). Leave blank or 0 if included at no extra cost.',
    }),
    defineField({name: 'description', type: 'text', rows: 2}),
    defineField({name: 'image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'skuSuffix', type: 'string'}),
    defineField({name: 'defaultSelected', type: 'boolean', initialValue: false}),
    defineField({name: 'medusaOptionId', type: 'string', readOnly: true}),
    defineField({name: 'medusaOptionValueId', type: 'string', readOnly: true}),
    defineField({name: 'lastSyncedAt', type: 'datetime', readOnly: true}),
  ],
  preview: {
    select: {title: 'label', subtitle: 'description', media: 'image'},
  },
})
