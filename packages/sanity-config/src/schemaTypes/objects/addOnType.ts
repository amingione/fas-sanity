import { defineType, defineField } from 'sanity'

export const addOnType = defineType({
  name: 'addOn',
  title: 'Upgrade',
  type: 'object',
  fields: [
    defineField({ name: 'label', type: 'string', title: 'Upgrade Name', validation: Rule => Rule.required() }),
    defineField({ name: 'priceDelta', type: 'number', title: 'Price Adjustment ($)', validation: Rule => Rule.min(0) }),
    defineField({ name: 'description', type: 'text', title: 'Description', rows: 2 }),
    defineField({ name: 'skuSuffix', type: 'string', title: 'SKU Suffix', description: 'Optional suffix to append when this upgrade is selected (e.g., -CERAMIC).'}),
    defineField({ name: 'defaultSelected', type: 'boolean', title: 'Selected by Default?' }),
  ],
  preview: {
    select: { title: 'label', price: 'priceDelta' },
    prepare: ({ title, price }) => ({ title: title || 'Upgrade', subtitle: typeof price === 'number' ? `+$${price.toFixed(2)}` : 'No charge' })
  }
})

