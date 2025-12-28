import {defineField, defineType} from 'sanity'
import StripeCouponPreview from '../../components/previews/StripeCouponPreview'

const API_VERSION = '2024-10-01'
const DURATION_OPTIONS = ['once', 'repeating', 'forever'] as const

const resolveIdVariants = (id?: string | null) => {
  const normalized = id?.replace(/^drafts\./, '') || ''
  if (!normalized) return []
  return [normalized, `drafts.${normalized}`]
}

export const stripeCouponType = defineType({
  name: 'stripeCoupon',
  type: 'document',
  title: 'Stripe Coupon',
  description: 'Coupons are managed in Stripe and synced automatically.',
  readOnly: true,
  // @ts-expect-error Allow restricting document actions even though the type no longer declares it
  __experimental_actions: [],
  components: {
    preview: StripeCouponPreview,
  },
  fields: [
    defineField({
      name: 'stripeId',
      type: 'string',
      title: 'Stripe Coupon ID',
      validation: (Rule) =>
        Rule.required().custom(async (value, context) => {
          if (!value || !context.getClient) return true
          const client = context.getClient({apiVersion: API_VERSION})
          const variants = resolveIdVariants(context.document?._id)
          const idList = variants.length ? variants : ['']
          const match = await client.fetch<string | null>(
            `*[_type == "stripeCoupon" && stripeId == $stripeId && !(_id in $ids)][0]._id`,
            {stripeId: value, ids: idList},
          )
          return match ? 'Stripe ID must be unique' : true
        }),
    }),
    defineField({name: 'name', type: 'string', title: 'Coupon Name', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'duration',
      type: 'string',
      title: 'Duration',
      options: {list: DURATION_OPTIONS.map((value) => ({title: value, value}))},
      validation: (Rule) =>
        Rule.required().custom((value) =>
          value && DURATION_OPTIONS.includes(value as (typeof DURATION_OPTIONS)[number])
            ? true
            : 'Duration must be once, repeating, or forever',
        ),
    }),
    defineField({
      name: 'valid',
      type: 'boolean',
      title: 'Valid',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Created At (Stripe)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'updatedAt',
      type: 'datetime',
      title: 'Last Synced At',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'percentOff',
      type: 'number',
      title: 'Percent Off',
      description: 'Percentage discount (0-100). Mutually exclusive with amount off.',
      validation: (Rule) =>
        Rule.min(0)
          .max(100)
          .custom((value, context) => {
            if (value === undefined || value === null) return true
            return context.document?.amountOff
              ? 'Percent off cannot be set when amount off is present.'
              : true
          }),
    }),
    defineField({
      name: 'amountOff',
      type: 'number',
      title: 'Amount Off (cents)',
      description: 'Fixed amount in cents. Mutually exclusive with percent off.',
      validation: (Rule) =>
        Rule.min(0).custom((value, context) => {
          if (value === undefined || value === null) return true
          if (context.document?.percentOff) {
            return 'Amount off cannot be set when percent off is present.'
          }
          return true
        }),
    }),
    defineField({
      name: 'currency',
      type: 'string',
      title: 'Currency',
      description: 'Required when amount off is set.',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (!context.document?.amountOff) return true
          return value ? true : 'Currency is required when amount off is set.'
        }),
    }),
    defineField({
      name: 'durationInMonths',
      type: 'number',
      title: 'Duration (months)',
      description: 'Required when duration is repeating.',
      validation: (Rule) =>
        Rule.min(1).custom((value, context) => {
          if (context.document?.duration !== 'repeating') return true
          return value ? true : 'Duration in months is required when repeating.'
        }),
    }),
    defineField({name: 'redeemBy', type: 'datetime', title: 'Redeem By'}),
    defineField({name: 'maxRedemptions', type: 'number', title: 'Max Redemptions'}),
    defineField({name: 'timesRedeemed', type: 'number', title: 'Times Redeemed'}),
    defineField({name: 'deletedAt', type: 'datetime', title: 'Deleted At'}),
    defineField({
      name: 'metadata',
      type: 'object',
      title: 'Stripe Metadata',
      description: 'Raw Stripe metadata stored as a JSON object.',
      fields: [],
    }),
  ],
  preview: {
    select: {
      stripeId: 'stripeId',
      name: 'name',
      percentOff: 'percentOff',
      amountOff: 'amountOff',
      currency: 'currency',
      valid: 'valid',
      deletedAt: 'deletedAt',
    },
    prepare({stripeId, name, percentOff, amountOff, currency, valid, deletedAt}) {
      const title = [stripeId, name].filter(Boolean).join(' - ')
      let discount = 'Unknown discount'
      if (typeof percentOff === 'number') {
        discount = `${percentOff}% off`
      } else if (typeof amountOff === 'number') {
        const code = currency ? currency.toUpperCase() : 'USD'
        const amount = amountOff / 100
        discount = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: code,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount)
        discount = `${discount} off`
      }
      const status = deletedAt ? 'Deleted' : valid ? 'Active' : 'Expired'
      return {
        title: title || 'Stripe Coupon',
        subtitle: `${discount} • ${status}`,
      }
    },
  },
})

export default stripeCouponType
