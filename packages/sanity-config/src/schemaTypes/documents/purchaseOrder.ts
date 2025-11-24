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
      description: 'Purchase order number (e.g., PO-2024-001)',
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
          {title: 'Draft', value: 'draft'},
          {title: 'Sent', value: 'sent'},
          {title: 'Acknowledged', value: 'acknowledged'},
          {title: 'In Production', value: 'in_production'},
          {title: 'Shipped', value: 'shipped'},
          {title: 'Received', value: 'received'},
          {title: 'Completed', value: 'completed'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
        layout: 'dropdown',
      },
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'orderDate',
      title: 'Order Date',
      type: 'date',
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
          type: 'object',
          name: 'lineItem',
          fields: [
            defineField({
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{type: 'product'}],
            }),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'string',
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
            defineField({
              name: 'received',
              title: 'Quantity Received',
              type: 'number',
              initialValue: 0,
            }),
          ],
          preview: {
            select: {
              product: 'product.title',
              quantity: 'quantity',
              unitPrice: 'unitPrice',
            },
            prepare(selection) {
              const {product, quantity, unitPrice} = selection
              const qty = typeof quantity === 'number' ? quantity : 0
              const price = typeof unitPrice === 'number' ? unitPrice : 0
              return {
                title: product || 'Product',
                subtitle: `Qty: ${qty} × $${price}`,
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
      title: 'Shipping Cost',
      type: 'number',
    }),
    defineField({
      name: 'total',
      title: 'Total',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'shipTo',
      title: 'Ship To Address',
      type: 'object',
      fields: [
        defineField({
          name: 'name',
          title: 'Name',
          type: 'string',
        }),
        defineField({
          name: 'address1',
          title: 'Address Line 1',
          type: 'string',
        }),
        defineField({
          name: 'address2',
          title: 'Address Line 2',
          type: 'string',
        }),
        defineField({
          name: 'city',
          title: 'City',
          type: 'string',
        }),
        defineField({
          name: 'state',
          title: 'State',
          type: 'string',
        }),
        defineField({
          name: 'zip',
          title: 'ZIP Code',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
    }),
    defineField({
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
      description: 'Not visible to vendor',
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [
        defineField({
          type: 'file',
          name: 'attachment',
          fields: [
            defineField({
              name: 'title',
              type: 'string',
              title: 'Title',
            }),
            defineField({
              name: 'description',
              type: 'text',
              title: 'Description',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'reference',
      to: [{type: 'user'}],
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'poNumber',
      vendor: 'vendor.companyName',
      status: 'status',
      total: 'total',
    },
    prepare(selection) {
      const {title, vendor, status, total} = selection
      const displayTotal = typeof total === 'number' ? total : 0
      return {
        title,
        subtitle: `${vendor || 'Vendor'} • ${status || 'Status'} • $${displayTotal}`,
      }
    },
  },
})
