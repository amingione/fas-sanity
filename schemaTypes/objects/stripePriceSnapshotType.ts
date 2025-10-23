import {defineField, defineType} from 'sanity'

export const stripePriceSnapshotType = defineType({
  name: 'stripePriceSnapshot',
  title: 'Stripe Price',
  type: 'object',
  fields: [
    defineField({ name: 'priceId', title: 'Price ID', type: 'string', readOnly: true }),
    defineField({ name: 'nickname', title: 'Nickname', type: 'string', readOnly: true }),
    defineField({ name: 'currency', title: 'Currency', type: 'string', readOnly: true }),
    defineField({ name: 'unitAmount', title: 'Unit Amount (major units)', type: 'number', readOnly: true }),
    defineField({ name: 'unitAmountRaw', title: 'Unit Amount (cents)', type: 'number', readOnly: true }),
    defineField({ name: 'type', title: 'Pricing Type', type: 'string', readOnly: true }),
    defineField({ name: 'billingScheme', title: 'Billing Scheme', type: 'string', readOnly: true }),
    defineField({ name: 'recurringInterval', title: 'Interval', type: 'string', readOnly: true }),
    defineField({ name: 'recurringIntervalCount', title: 'Interval Count', type: 'number', readOnly: true }),
    defineField({ name: 'active', title: 'Active', type: 'boolean', readOnly: true }),
    defineField({ name: 'livemode', title: 'Live Mode', type: 'boolean', readOnly: true }),
    defineField({ name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true }),
    defineField({ name: 'lookupKey', title: 'Lookup Key', type: 'string', readOnly: true }),
    defineField({ name: 'taxBehavior', title: 'Tax Behavior', type: 'string', readOnly: true }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'array',
      of: [{ type: 'stripeMetadataEntry' }],
      readOnly: true,
      options: { layout: 'grid' },
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
    prepare({ title, amount, currency, interval, intervalCount, active }) {
      const amt = typeof amount === 'number' ? `$${amount.toFixed(2)} ${currency || ''}`.trim() : currency || 'Price'
      const recurring = interval ? `${intervalCount || 1}/${interval}` : 'one-time'
      return {
        title: title || amt,
        subtitle: `${amt} • ${recurring}${active === false ? ' • inactive' : ''}`,
      }
    },
  },
})
