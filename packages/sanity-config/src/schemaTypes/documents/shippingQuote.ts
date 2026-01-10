import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'shippingQuote',
  title: 'Shipping Quote Cache',
  type: 'document',
  fields: [
    defineField({name: 'quoteKey', title: 'Quote Key', type: 'string', readOnly: true}),
    defineField({name: 'quoteRequestId', title: 'Quote Request ID', type: 'string', readOnly: true}),
    defineField({name: 'easyPostShipmentId', title: 'EasyPost Shipment ID', type: 'string', readOnly: true}),
    defineField({
      name: 'destination',
      title: 'Destination',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({name: 'addressLine1', title: 'Address Line 1', type: 'string'}),
        defineField({name: 'city', title: 'City', type: 'string'}),
        defineField({name: 'state', title: 'State', type: 'string'}),
        defineField({name: 'postalCode', title: 'Postal Code', type: 'string'}),
        defineField({name: 'country', title: 'Country', type: 'string'}),
      ],
    }),
    defineField({
      name: 'rates',
      title: 'Rates',
      type: 'array',
      of: [
        {
          type: 'object',
          readOnly: true,
          fields: [
            defineField({name: 'rateId', title: 'Rate ID', type: 'string'}),
            defineField({name: 'carrier', title: 'Carrier', type: 'string'}),
            defineField({name: 'service', title: 'Service', type: 'string'}),
            defineField({name: 'amount', title: 'Amount', type: 'number'}),
            defineField({name: 'currency', title: 'Currency', type: 'string'}),
            defineField({name: 'deliveryDays', title: 'Delivery Days', type: 'number'}),
            defineField({name: 'carrierId', title: 'Carrier ID', type: 'string'}),
            defineField({name: 'serviceCode', title: 'Service Code', type: 'string'}),
            defineField({name: 'deliveryConfidence', title: 'Delivery Confidence', type: 'number'}),
          ],
        },
      ],
    }),
    defineField({
      name: 'packages',
      title: 'Packages',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'weight', title: 'Weight', type: 'number'}),
            defineField({name: 'length', title: 'Length', type: 'number'}),
            defineField({name: 'width', title: 'Width', type: 'number'}),
            defineField({name: 'height', title: 'Height', type: 'number'}),
          ],
        },
      ],
    }),
    defineField({
      name: 'missingProducts',
      title: 'Missing Products',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
    }),
    defineField({name: 'carrierId', title: 'Carrier ID', type: 'string', readOnly: true}),
    defineField({name: 'serviceCode', title: 'Service Code', type: 'string', readOnly: true}),
    defineField({name: 'cartSummary', title: 'Cart Summary', type: 'text', readOnly: true}),
    defineField({
      name: 'source',
      title: 'Quote Source',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          {title: 'Fresh', value: 'fresh'},
          {title: 'Cache', value: 'cache'},
        ],
      },
    }),
    defineField({name: 'rateCount', title: 'Rate Count', type: 'number', readOnly: true}),
    defineField({name: 'createdAt', title: 'Created At', type: 'datetime', readOnly: true}),
    defineField({name: 'updatedAt', title: 'Updated At', type: 'datetime', readOnly: true}),
    defineField({name: 'expiresAt', title: 'Expires At', type: 'datetime', readOnly: true}),
  ],
  preview: {
    select: {
      title: 'quoteKey',
      subtitle: 'cartSummary',
    },
  },
})
