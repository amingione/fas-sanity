import {defineType, defineField} from 'sanity'

export const pricingTierType = defineType({
  name: 'pricingTier',
  title: 'Pricing Tier',
  type: 'object',
  fields: [
    defineField({name: 'label', type: 'string', title: 'Tier Name'}),
    defineField({name: 'price', type: 'number', title: 'Price'}),
  ],
})
