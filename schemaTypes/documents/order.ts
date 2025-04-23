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
      })
    ]
});