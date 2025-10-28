
import { defineType, defineField } from 'sanity'
import CustomerDiscountsInput from '../../components/inputs/CustomerDiscountsInput'

const CUSTOMER_GROUPS = [
  { name: 'profile', title: 'Profile', default: true },
  { name: 'addresses', title: 'Addresses' },
  { name: 'activity', title: 'Activity' },
  { name: 'marketing', title: 'Marketing' },
  { name: 'stripe', title: 'Stripe' },
  { name: 'discounts', title: 'Discounts' },
]

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  groups: CUSTOMER_GROUPS,
  fieldsets: [
    {
      name: 'shippingInfo',
      title: 'Shipping Address',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'billingInfo',
      title: 'Billing Address',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    // Identity
    defineField({
      name: 'userId',
      title: 'External User ID',
      type: 'string',
      description:
        'Legacy identifier for imported accounts. FAS Auth uses this document ID, so new users can leave this empty.',
      group: 'profile',
    }),
    defineField({
      name: 'name',
      title: 'Legacy Full Name',
      type: 'string',
      readOnly: true,
      description:
        'Existing records may still use this legacy field. Use the action button or copy the value into First/Last Name below.',
      hidden: ({ document }) => !document?.name,
      group: 'profile',
    }),
    defineField({ name: 'firstName', title: 'First Name', type: 'string', group: 'profile' }),
    defineField({ name: 'lastName', title: 'Last Name', type: 'string', group: 'profile' }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: Rule => Rule.required().email(),
      group: 'profile',
    }),
    defineField({
      name: 'stripeCustomerId',
      title: 'Stripe Customer ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'roles',
      title: 'Roles',
      type: 'array',
      of: [{ type: 'string' }],
      initialValue: ['customer'],
      options: {
        list: [
          { title: 'Customer', value: 'customer' },
          { title: 'Guest (no account)', value: 'guest' },
          { title: 'Vendor', value: 'vendor' },
          { title: 'Admin', value: 'admin' },
        ],
      },
      validation: (Rule) => Rule.required().min(1).warning('Users should have at least one role'),
      description:
        'Used by FAS Auth to gate access to portals. Guests are imported from Stripe and do not have login access.',
      group: 'profile',
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      hidden: true,
      group: 'profile',
    }),
    defineField({ name: 'phone', title: 'Phone Number', type: 'string', group: 'profile' }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'customerBillingAddress',
      fieldset: 'shippingInfo',
      group: 'addresses',
    }),
    defineField({
      name: 'address',
      title: 'Shipping Address (legacy)',
      type: 'text',
      fieldset: 'shippingInfo',
      hidden: true,
      group: 'addresses',
    }),
    defineField({
      name: 'billingAddress',
      title: 'Billing Address',
      type: 'customerBillingAddress',
      fieldset: 'billingInfo',
      group: 'addresses',
    }),
    defineField({
      name: 'orders',
      title: 'Orders',
      type: 'array',
      of: [{ type: 'customerOrderSummary' }],
      group: 'activity',
    }),
    defineField({
      name: 'quotes',
      title: 'Saved Quotes',
      type: 'array',
      of: [{ type: 'customerQuoteSummary' }],
      group: 'activity',
    }),
    defineField({
      name: 'addresses',
      title: 'Addresses',
      type: 'array',
      of: [{ type: 'customerAddress' }],
      group: 'addresses',
    }),
    defineField({
      name: 'wishlistItems',
      title: 'Wishlist Items',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }],
      group: 'activity',
    }),
    defineField({
      name: 'stripeMetadata',
      title: 'Latest Stripe Metadata',
      type: 'array',
      of: [{ type: 'stripeMetadataEntry' }],
      readOnly: true,
      group: 'stripe',
    }),
    // Marketing preferences
    defineField({ name: 'emailOptIn', title: 'Email Opt‑In', type: 'boolean', initialValue: false, group: 'marketing' }),
    defineField({ name: 'marketingOptIn', title: 'Marketing Opt‑In', type: 'boolean', initialValue: false, group: 'marketing' }),
    defineField({ name: 'textOptIn', title: 'Text/SMS Opt‑In', type: 'boolean', initialValue: false, group: 'marketing' }),
    defineField({ name: 'orderCount', title: 'Order Count', type: 'number', readOnly: true, group: 'activity' }),
    defineField({ name: 'quoteCount', title: 'Quote Count', type: 'number', readOnly: true, group: 'activity' }),
    defineField({ name: 'lifetimeSpend', title: 'Lifetime Spend ($)', type: 'number', readOnly: true, group: 'activity' }),
    defineField({
      name: 'discounts',
      title: 'Stripe Discounts',
      type: 'array',
      of: [{ type: 'customerDiscount' }],
      readOnly: true,
      group: 'discounts',
      components: { input: CustomerDiscountsInput as any },
      description: 'Synced customer-level coupons and promotions from Stripe.',
    }),
    defineField({ name: 'updatedAt', title: 'Updated At', type: 'datetime', group: 'profile' }),
  ],

  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      orderCount: 'orderCount',
      lifetimeSpend: 'lifetimeSpend',
      city: 'shippingAddress.city',
      state: 'shippingAddress.state',
      emailOptIn: 'emailOptIn',
      marketingOptIn: 'marketingOptIn',
    },
    prepare({ firstName, lastName, email, orderCount, lifetimeSpend, city, state, emailOptIn, marketingOptIn }) {
      const name = [firstName, lastName].filter(Boolean).join(' ').trim()
      const location = [city, state].filter(Boolean).join(', ')
      const orders = typeof orderCount === 'number' ? orderCount : 0
      const spend = typeof lifetimeSpend === 'number'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lifetimeSpend)
        : '$0'
      const subscribed = emailOptIn || marketingOptIn ? '✓' : ''

      const parts = [
        orders > 0 ? `${orders} orders` : 'No orders',
        spend,
        location,
        subscribed ? 'Subscribed' : ''
      ].filter(Boolean)

      return {
        title: name || email || 'Unnamed Customer',
        subtitle: parts.join(' • '),
        description: email || undefined,
      }
    },
  },

})
