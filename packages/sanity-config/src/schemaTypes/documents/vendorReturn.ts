import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorReturn',
  title: 'Vendor Return (RMA)',
  type: 'document',
  fields: [
    defineField({
      name: 'rmaNumber',
      title: 'RMA Number',
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
      name: 'order',
      title: 'Related Order',
      type: 'reference',
      to: [{type: 'purchaseOrder'}],
    }),
    defineField({
      name: 'reason',
      title: 'Reason',
      type: 'string',
      options: {
        list: [
          {title: 'Defective', value: 'defective'},
          {title: 'Wrong Item', value: 'wrong_item'},
          {title: 'Damaged in Transit', value: 'damaged'},
          {title: 'Not as Described', value: 'not_as_described'},
          {title: 'Other', value: 'other'},
        ],
      },
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'items',
      title: 'Items to Return',
      type: 'array',
      of: [
        defineField({
          name: 'returnItem',
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
              name: 'reason',
              title: 'Reason',
              type: 'string',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'photos',
      title: 'Photos',
      type: 'array',
      of: [{type: 'image'}],
      description: 'Photos of damaged or defective items',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Approved', value: 'approved'},
          {title: 'Rejected', value: 'rejected'},
          {title: 'Received', value: 'received'},
          {title: 'Refunded', value: 'refunded'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'refundAmount',
      title: 'Refund Amount',
      type: 'number',
    }),
    defineField({
      name: 'refundMethod',
      title: 'Refund Method',
      type: 'string',
      options: {
        list: ['Credit', 'Check', 'Original Payment Method'],
      },
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'resolvedAt',
      title: 'Resolved At',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {
      title: 'rmaNumber',
      vendor: 'vendor.companyName',
      status: 'status',
    },
    prepare({title, vendor, status}) {
      return {
        title: title || 'New RMA',
        subtitle: `${vendor || 'Vendor'} | ${status || 'Status'}`,
      }
    },
  },
})
