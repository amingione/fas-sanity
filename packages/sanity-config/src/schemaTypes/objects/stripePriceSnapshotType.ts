import {defineField, defineType} from 'sanity'

export const stripePriceSnapshotType = defineType({
  name: 'stripePriceSnapshot',
  title: 'Stripe Price',
  type: 'object',
  fields: [
    defineField({name: 'priceId', title: 'Price ID', type: 'string', readOnly: false}),
    defineField({name: 'nickname', title: 'Nickname', type: 'string', readOnly: false}),
    defineField({name: 'currency', title: 'Currency', type: 'string', readOnly: false}),
    defineField({
      name: 'unitAmount',
      title: 'Unit Amount (major units)',
      type: 'number',
      readOnly: false,
    }),
    defineField({
      name: 'unitAmountRaw',
      title: 'Unit Amount (cents)',
      type: 'number',
      readOnly: false,
    }),
    defineField({name: 'type', title: 'Pricing Type', type: 'string', readOnly: false}),
    defineField({name: 'billingScheme', title: 'Billing Scheme', type: 'string', readOnly: false}),
    defineField({name: 'recurringInterval', title: 'Interval', type: 'string', readOnly: false}),
    defineField({
      name: 'recurringIntervalCount',
      title: 'Interval Count',
      type: 'number',
      readOnly: false,
    }),
    defineField({name: 'active', title: 'Active', type: 'boolean', readOnly: false}),
    defineField({name: 'livemode', title: 'Live Mode', type: 'boolean', readOnly: false}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: false}),
    defineField({name: 'lookupKey', title: 'Lookup Key', type: 'string', readOnly: false}),
    defineField({name: 'taxBehavior', title: 'Tax Behavior', type: 'string', readOnly: false}),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'array',
      of: [{type: 'stripeMetadataEntry'}],
      readOnly: false,
      options: {layout: 'grid'},
    }),
  ],
  preview: {
    select: {
      title: 'priceId',
      amount: 'unitAmount',
      currency: 'currency',
      interval: 'recurringInterval',
      intervalCount: 'recurringIntervalCount',
      active: 'active',
    },
    prepare({title, amount, currency, interval, intervalCount, active}) {
      const amt =
        typeof amount === 'number'
          ? `$${amount.toFixed(2)} ${currency || ''}`.trim()
          : currency || 'Price'
      const recurring = interval ? `${intervalCount || 1}/${interval}` : 'one-time'
      return {
        title: title || amt,
        subtitle: `${amt} • ${recurring}${active === false ? ' • inactive' : ''}`,
      }
    },
  },
})
