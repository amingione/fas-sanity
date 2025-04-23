import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    defineField({
      name: 'stripeSessionId',
      title: 'Stripe Session ID',
      type: 'string',
    }),
    defineField({
      name: 'customerEmail',
      title: 'Customer Email',
      type: 'string',
    }),
    defineField({
      name: 'cart',
      title: 'Cart Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'id', type: 'string', title: 'Product ID' },
            { name: 'name', type: 'string', title: 'Product Name' },
            { name: 'price', type: 'number', title: 'Unit Price' },
            { name: 'quantity', type: 'number', title: 'Quantity' },
            {
              name: 'categories',
              title: 'Category Refs',
              type: 'array',
              of: [{ type: 'string' }]
            }
          ]
        }
      ]
    }),
    defineField({
      name: 'totalAmount',
      title: 'Total Amount (USD)',
      type: 'number'
    }),
    defineField({
      name: 'status',
      title: 'Order Status',
      type: 'string',
      options: {
        list: ['pending', 'paid', 'fulfilled', 'cancelled'],
        layout: 'dropdown'
      },
      initialValue: 'pending'
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      fields: [
        { name: 'name', type: 'string', title: 'Recipient Name' },
        { name: 'phone', type: 'string', title: 'Phone Number' },
        { name: 'email', type: 'string', title: 'Email' },
        { name: 'addressLine1', type: 'string', title: 'Address Line 1' },
        { name: 'addressLine2', type: 'string', title: 'Address Line 2' },
        { name: 'city', type: 'string', title: 'City' },
        { name: 'state', type: 'string', title: 'State' },
        { name: 'postalCode', type: 'string', title: 'ZIP/Postal Code' },
        { name: 'country', type: 'string', title: 'Country Code', initialValue: 'US' }
      ]
    }),
    defineField({
      name: 'shippingLabelUrl',
      title: 'Shipping Label URL',
      type: 'url'
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string'
    }),
    defineField({
      name: 'packingSlipUrl',
      title: 'Packing Slip PDF URL',
      type: 'url'
    }),
    defineField({
      name: 'fulfilledAt',
      title: 'Fulfilled Date',
      type: 'datetime'
    })
  ]
});