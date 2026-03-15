import {defineArrayMember, defineField, defineType} from 'sanity'

export const stripePriceSnapshotType = defineType({
  name: 'stripePriceSnapshot',
  title: 'Stripe Price Snapshot',
  type: 'object',
  fields: [
    defineField({name: 'priceId', type: 'string'}),
    defineField({name: 'nickname', type: 'string'}),
    defineField({name: 'active', type: 'boolean'}),
    defineField({name: 'billingScheme', type: 'string'}),
    defineField({name: 'createdAt', type: 'datetime'}),
    defineField({name: 'currency', type: 'string'}),
    defineField({name: 'livemode', type: 'boolean'}),
    defineField({name: 'taxBehavior', type: 'string'}),
    defineField({name: 'type', type: 'string'}),
    defineField({name: 'unitAmount', type: 'number'}),
    defineField({name: 'unitAmountRaw', type: 'number'}),
    defineField({
      name: 'metadata',
      type: 'array',
      of: [defineArrayMember({type: 'stripeMetadataEntry'})],
    }),
  ],
  preview: {
    select: {
      title: 'nickname',
      fallbackTitle: 'priceId',
      subtitle: 'currency',
      amount: 'unitAmount',
      active: 'active',
    },
    prepare({title, fallbackTitle, subtitle, amount, active}) {
      const label = title || fallbackTitle || 'Stripe price'
      const status = active ? 'active' : 'inactive'
      const amountText = typeof amount === 'number' ? `${amount}` : ''
      return {
        title: label,
        subtitle: [amountText, subtitle, status].filter(Boolean).join(' • '),
      }
    },
  },
})
