import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'purchaseOrder',
  title: 'Purchase Order',
  type: 'document',
  fields: [
    defineField({
      name: 'poNumber',
      title: 'PO Number',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Approved', value: 'approved'},
          {title: 'Shipped', value: 'shipped'},
          {title: 'Received', value: 'received'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'orderDate',
      title: 'Order Date',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expectedDelivery',
      title: 'Expected Delivery Date',
      type: 'date',
    }),
    defineField({
      name: 'actualDelivery',
      title: 'Actual Delivery Date',
      type: 'date',
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [
        defineField({
          name: 'lineItem',
          type: 'object',
          fields: [
            defineField({
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{type: 'product'}],
            }),
            defineField({
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
              validation: (Rule) => Rule.required().min(1),
            }),
            defineField({
              name: 'unitPrice',
              title: 'Unit Price',
              type: 'number',
              validation: (Rule) => Rule.required().min(0),
            }),
            defineField({
              name: 'total',
              title: 'Total',
              type: 'number',
              readOnly: true,
            }),
          ],
          preview: {
            select: {
              title: 'product.title',
              quantity: 'quantity',
              total: 'total',
            },
            prepare({title, quantity, total}) {
              const qty = typeof quantity === 'number' ? quantity : 0
              const lineTotal = typeof total === 'number' ? total : 0
              return {
                title: title || 'Product',
                subtitle: `Qty: ${qty} | Total: $${lineTotal}`,
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'subtotal',
      title: 'Subtotal',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'tax',
      title: 'Tax',
      type: 'number',
    }),
    defineField({
      name: 'shipping',
      title: 'Shipping',
      type: 'number',
    }),
    defineField({
      name: 'total',
      title: 'Total',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      fields: [
        defineField({name: 'street', type: 'string', title: 'Street'}),
        defineField({name: 'address2', type: 'string', title: 'Address Line 2'}),
        defineField({name: 'city', type: 'string', title: 'City'}),
        defineField({name: 'state', type: 'string', title: 'State'}),
        defineField({name: 'zip', type: 'string', title: 'ZIP Code'}),
        defineField({
          name: 'country',
          type: 'string',
          title: 'Country',
          initialValue: 'USA',
        }),
      ],
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'statusHistory',
      title: 'Status History',
      type: 'array',
      of: [
        defineField({
          name: 'statusHistoryEntry',
          type: 'object',
          fields: [
            defineField({name: 'status', type: 'string', title: 'Status'}),
            defineField({name: 'timestamp', type: 'datetime', title: 'Timestamp'}),
            defineField({name: 'note', type: 'text', title: 'Note'}),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'poNumber',
      vendor: 'vendor.companyName',
      status: 'status',
      total: 'total',
    },
    prepare({title, vendor, status, total}) {
      const displayTotal = typeof total === 'number' ? total : 0
      return {
        title: title || 'New PO',
        subtitle: `${vendor || 'Vendor'} | ${status || 'Status'} | $${displayTotal}`,
      }
    },
  },
})
