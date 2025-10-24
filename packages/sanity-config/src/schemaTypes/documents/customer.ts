
import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
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
    }),
    defineField({
      name: 'name',
      title: 'Legacy Full Name',
      type: 'string',
      readOnly: true,
      description:
        'Existing records may still use this legacy field. Use the action button or copy the value into First/Last Name below.',
      hidden: ({ document }) => !document?.name,
    }),
    defineField({ name: 'firstName', title: 'First Name', type: 'string' }),
    defineField({ name: 'lastName', title: 'Last Name', type: 'string' }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: Rule => Rule.required().email()
    }),
    defineField({
      name: 'stripeCustomerId',
      title: 'Stripe Customer ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
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
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      hidden: true
    }),
    defineField({ name: 'phone', title: 'Phone Number', type: 'string' }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'customerBillingAddress',
      fieldset: 'shippingInfo',
    }),
    defineField({
      name: 'address',
      title: 'Shipping Address (legacy)',
      type: 'text',
      fieldset: 'shippingInfo',
      hidden: true,
    }),
    defineField({
      name: 'billingAddress',
      title: 'Billing Address',
      type: 'customerBillingAddress',
      fieldset: 'billingInfo',
    }),
    defineField({ name: 'orders', title: 'Orders', type: 'array', of: [ { type: 'customerOrderSummary' } ] }),
    defineField({ name: 'quotes', title: 'Saved Quotes', type: 'array', of: [ { type: 'customerQuoteSummary' } ] }),
    defineField({ name: 'addresses', title: 'Addresses', type: 'array', of: [ { type: 'customerAddress' } ] }),
    defineField({
      name: 'wishlistItems',
      title: 'Wishlist Items',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }]
    }),
    defineField({
      name: 'stripeMetadata',
      title: 'Latest Stripe Metadata',
      type: 'array',
      of: [{ type: 'stripeMetadataEntry' }],
      readOnly: true,
    }),
    // Marketing preferences
    defineField({ name: 'emailOptIn', title: 'Email Opt‑In', type: 'boolean', initialValue: false }),
    defineField({ name: 'marketingOptIn', title: 'Marketing Opt‑In', type: 'boolean', initialValue: false }),
    defineField({ name: 'textOptIn', title: 'Text/SMS Opt‑In', type: 'boolean', initialValue: false }),
    defineField({ name: 'orderCount', title: 'Order Count', type: 'number', readOnly: true }),
    defineField({ name: 'quoteCount', title: 'Quote Count', type: 'number', readOnly: true }),
    defineField({ name: 'lifetimeSpend', title: 'Lifetime Spend ($)', type: 'number', readOnly: true }),
    defineField({ name: 'updatedAt', title: 'Updated At', type: 'datetime' }),
  ],

  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email'
    },
    prepare({ firstName, lastName, email }) {
      const name = [firstName, lastName].filter(Boolean).join(' ').trim()
      return {
        title: name || email || 'Unnamed Customer',
        subtitle: email || undefined,
      }
    },
  },

})
