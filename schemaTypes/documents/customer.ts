
import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  fields: [
    defineField({ name: 'firstName', title: 'First Name', type: 'string' }),
    defineField({ name: 'lastName', title: 'Last Name', type: 'string' }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: Rule => Rule.required().email()
    }),
    defineField({
      name: 'userRole',
      title: 'User Role',
      type: 'string',
      initialValue: 'customer',
      options: {
        list: [
          {title: 'Customer', value: 'customer'},
          {title: 'Vendor', value: 'vendor'},
          {title: 'Admin', value: 'admin'},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      validation: (Rule) => Rule.required(),
      description:
        'Controls post-login routing (e.g. customer portal vs vendor portal). Change only if you know what you are doing.'
    }),
    defineField({
      name: 'auth0Id',
      title: 'Auth0 User ID',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      hidden: true
    }),
    defineField({ name: 'phone', title: 'Phone Number', type: 'string' }),
    defineField({ name: 'address', title: 'Shipping Address', type: 'text' }),
    defineField({ name: 'billingAddress', title: 'Billing Address', type: 'customerBillingAddress' }),
    defineField({ name: 'orders', title: 'Orders', type: 'array', of: [ { type: 'customerOrderSummary' } ] }),
    defineField({ name: 'quotes', title: 'Saved Quotes', type: 'array', of: [ { type: 'customerQuoteSummary' } ] }),
    defineField({ name: 'addresses', title: 'Addresses', type: 'array', of: [ { type: 'customerAddress' } ] }),
    defineField({
      name: 'wishlistItems',
      title: 'Wishlist Items',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }]
    }),
    defineField({ name: 'orderCount', title: 'Order Count', type: 'number', readOnly: true }),
    defineField({ name: 'quoteCount', title: 'Quote Count', type: 'number', readOnly: true }),
    defineField({ name: 'lifetimeSpend', title: 'Lifetime Spend ($)', type: 'number', readOnly: true })
  ],

  preview: {
    select: {
      title: 'email',
      subtitle: 'firstName'
    }
  },

})
