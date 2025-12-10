import {defineType, defineField} from 'sanity'

export const addOnType = defineType({
  name: 'addOn',
  title: 'Custom Upgrade',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      type: 'string',
      title: 'Upgrade Name',
      description: 'E.g., "Ceramic Coating", "Extended Warranty"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'priceDelta',
      type: 'number',
      title: 'Price Adjustment ($)',
      description: 'Additional cost (use positive number)',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 2,
      title: 'Description',
      description: 'Why should they add this upgrade?',
    }),
    defineField({
      name: 'skuSuffix',
      type: 'string',
      title: 'SKU Suffix',
      description: 'Optional suffix (e.g., -CERAMIC)',
    }),
    defineField({
      name: 'defaultSelected',
      type: 'boolean',
      title: 'Pre-selected by Default?',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      label: 'label',
      priceDelta: 'priceDelta',
      description: 'description',
    },
    prepare({label, priceDelta, description}) {
      const price = typeof priceDelta === 'number' ? `+$${priceDelta.toFixed(2)}` : 'No price'
      return {
        title: label || 'Unnamed Upgrade',
        subtitle: `${price} • ${description || 'No description'}`,
      }
    },
  },
})
