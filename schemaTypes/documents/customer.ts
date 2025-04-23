import { defineType } from 'sanity'

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  fields: [
    {
      name: 'firstName',
      title: 'First Name',
      type: 'string',
    },
    {
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
    },
    {
      name: 'email',
      title: 'Email',
      type: 'string',
    },
    {
      name: 'phone',
      title: 'Phone Number',
      type: 'string',
    },
    {
      name: 'address',
      title: 'Shipping Address',
      type: 'text',
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
      name: 'wishlistItems',
      title: 'Wishlist Items',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }]
    },
    {
      name: 'orderCount',
      title: 'Order Count',
      type: 'number',
      readOnly: true
    },
    {
      name: 'quoteCount',
      title: 'Quote Count',
      type: 'number',
      readOnly: true
    },
    {
      name: 'lifetimeSpend',
      title: 'Lifetime Spend ($)',
      type: 'number',
      readOnly: true
    }
  ]
})

export const customerType = defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  fields: [
    {
      name: 'firstName',
      title: 'First Name',
      type: 'string',
    },
    {
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
    },
    {
      name: 'email',
      title: 'Email',
      type: 'string',
    },
    {
      name: 'phone',
      title: 'Phone Number',
      type: 'string',
    },
    {
      name: 'address',
      title: 'Shipping Address',
      type: 'text',
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
      name: 'wishlistItems',
      title: 'Wishlist Items',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'product' }] }]
    },
    {
      name: 'orderCount',
      title: 'Order Count',
      type: 'number',
      readOnly: true
    },
    {
      name: 'quoteCount',
      title: 'Quote Count',
      type: 'number',
      readOnly: true
    },
    {
      name: 'lifetimeSpend',
      title: 'Lifetime Spend ($)',
      type: 'number',
      readOnly: true
    }
  ]
})
