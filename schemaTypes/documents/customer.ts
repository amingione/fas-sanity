
import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  fields: [
    defineField({ name: 'firstName', title: 'First Name', type: 'string' }),
    defineField({ name: 'lastName', title: 'Last Name', type: 'string' }),
    defineField({ name: 'email', title: 'Email', type: 'string' }),
    defineField({ name: 'passwordHash', title: 'Password Hash', type: 'string' }),
    defineField({ name: 'phone', title: 'Phone Number', type: 'string' }),
    defineField({ name: 'address', title: 'Shipping Address', type: 'text' }),
    defineField({
      name: 'billingAddress',
      title: 'Billing Address',
      type: 'object',
      fields: [
        { name: 'name', title: 'Full Name', type: 'string' },
        { name: 'street', title: 'Street Address', type: 'string' },
        { name: 'city', title: 'City', type: 'string' },
        { name: 'state', title: 'State/Province', type: 'string' },
        { name: 'postalCode', title: 'Postal Code', type: 'string' },
        { name: 'country', title: 'Country', type: 'string' }
      ]
    }),
    defineField({
      name: 'orders',
      title: 'Orders',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'orderNumber', title: 'Order Number', type: 'string' },
            { name: 'status', title: 'Status', type: 'string' },
            { name: 'orderDate', title: 'Order Date', type: 'datetime' },
            { name: 'total', title: 'Total Amount', type: 'string' }
          ]
        }
      ]
    }),
    defineField({
      name: 'quotes',
      title: 'Saved Quotes',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'quoteId', title: 'Quote ID', type: 'string' },
            { name: 'status', title: 'Status', type: 'string' },
            { name: 'dateRequested', title: 'Date Requested', type: 'datetime' },
            { name: 'notes', title: 'Notes', type: 'text' }
          ]
        }
      ]
    }),
    defineField({
      name: 'addresses',
      title: 'Addresses',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', title: 'Label (e.g. Home, Office)', type: 'string' },
            { name: 'street', title: 'Street Address', type: 'string' },
            { name: 'city', title: 'City', type: 'string' },
            { name: 'state', title: 'State', type: 'string' },
            { name: 'zip', title: 'ZIP Code', type: 'string' },
            { name: 'country', title: 'Country', type: 'string' }
          ]
        }
      ]
    }),
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
