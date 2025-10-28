import {defineField, defineType} from 'sanity'

const statusLabel = (value?: string | null) => {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export const customerDiscountType = defineType({
  name: 'customerDiscount',
  title: 'Customer Discount',
  type: 'object',
  fields: [
    defineField({ name: 'stripeDiscountId', title: 'Stripe Discount ID', type: 'string', readOnly: true }),
    defineField({ name: 'stripeCouponId', title: 'Stripe Coupon ID', type: 'string', readOnly: true }),
    defineField({ name: 'couponName', title: 'Coupon Name', type: 'string', readOnly: true }),
    defineField({ name: 'promotionCodeId', title: 'Promotion Code', type: 'string', readOnly: true }),
    defineField({ name: 'status', title: 'Status', type: 'string', readOnly: true }),
    defineField({ name: 'percentOff', title: 'Percent Off', type: 'number', readOnly: true }),
    defineField({ name: 'amountOff', title: 'Amount Off', type: 'number', readOnly: true, description: 'Major currency units (e.g. dollars).' }),
    defineField({ name: 'currency', title: 'Currency', type: 'string', readOnly: true }),
    defineField({ name: 'duration', title: 'Duration', type: 'string', readOnly: true }),
    defineField({ name: 'durationInMonths', title: 'Duration (months)', type: 'number', readOnly: true }),
    defineField({ name: 'redeemBy', title: 'Redeem By', type: 'datetime', readOnly: true }),
    defineField({ name: 'startsAt', title: 'Starts At', type: 'datetime', readOnly: true }),
    defineField({ name: 'endsAt', title: 'Ends At', type: 'datetime', readOnly: true }),
    defineField({ name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true }),
    defineField({ name: 'maxRedemptions', title: 'Max Redemptions', type: 'number', readOnly: true }),
    defineField({ name: 'timesRedeemed', title: 'Times Redeemed', type: 'number', readOnly: true }),
    defineField({ name: 'valid', title: 'Valid', type: 'boolean', readOnly: true }),
    defineField({ name: 'livemode', title: 'Live Mode', type: 'boolean', readOnly: true }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'array',
      of: [{ type: 'stripeMetadataEntry' }],
      readOnly: true,
    }),
    defineField({ name: 'stripeLastSyncedAt', title: 'Last Synced', type: 'datetime', readOnly: true }),
  ],
  preview: {
    select: {
      name: 'couponName',
      percentOff: 'percentOff',
      amountOff: 'amountOff',
      currency: 'currency',
      status: 'status',
    },
    prepare(selection) {
      const { name, percentOff, amountOff, currency, status } = selection as {
        name?: string
        percentOff?: number
        amountOff?: number
        currency?: string
        status?: string
      }
      const normalizedStatus = statusLabel(status)
      const amountLabel =
        typeof amountOff === 'number' && amountOff !== 0
          ? `${
              new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency ? currency.toUpperCase() : 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(amountOff)
            } off`
          : null
      const percentLabel = typeof percentOff === 'number' && percentOff !== 0 ? `${percentOff}% off` : null
      const title = name || percentLabel || amountLabel || 'Customer discount'
      const parts = [normalizedStatus, percentLabel, amountLabel].filter(Boolean)
      return {
        title,
        subtitle: parts.join(' • '),
      }
    },
  },
})
