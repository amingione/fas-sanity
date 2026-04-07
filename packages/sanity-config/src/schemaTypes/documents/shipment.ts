import {defineField, defineType} from 'sanity'

const SHIPMENT_STATUS_OPTIONS = [
  {title: 'Pending', value: 'pending'},
  {title: 'Label Created', value: 'label_created'},
  {title: 'Shipped', value: 'shipped'},
  {title: 'In Transit', value: 'in_transit'},
  {title: 'Out for Delivery', value: 'out_for_delivery'},
  {title: 'Delivered', value: 'delivered'},
  {title: 'Returned', value: 'returned'},
  {title: 'Exception', value: 'exception'},
]

const CARRIER_OPTIONS = [
  {title: 'Shippo', value: 'shippo'},
  {title: 'UPS', value: 'ups'},
  {title: 'USPS', value: 'usps'},
  {title: 'FedEx', value: 'fedex'},
  {title: 'DHL', value: 'dhl'},
  {title: 'Other', value: 'other'},
]

export default defineType({
  name: 'shipment',
  title: 'Shipments',
  type: 'document',
  fields: [
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: SHIPMENT_STATUS_OPTIONS},
      initialValue: 'pending',
    }),
    defineField({
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
      options: {list: CARRIER_OPTIONS},
    }),
    defineField({name: 'trackingNumber', title: 'Tracking Number', type: 'string'}),
    defineField({name: 'trackingUrl', title: 'Tracking URL', type: 'url'}),
    defineField({
      name: 'labelUrl',
      title: 'Label URL',
      type: 'url',
      description: 'Direct URL to the shipping label (PDF or image).',
    }),
    defineField({
      name: 'postageLabel',
      title: 'Postage Label',
      type: 'object',
      fields: [
        defineField({name: 'labelPdfUrl', title: 'PDF URL', type: 'url'}),
        defineField({name: 'labelUrl', title: 'Label URL', type: 'url'}),
      ],
    }),
    defineField({
      name: 'order',
      title: 'Order',
      type: 'reference',
      weak: true,
      to: [{type: 'order'}],
    }),
    defineField({
      name: 'invoice',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
    }),
    defineField({name: 'shippedAt', title: 'Shipped At', type: 'datetime'}),
    defineField({name: 'estimatedDelivery', title: 'Estimated Delivery', type: 'date'}),
    defineField({name: 'weight', title: 'Weight (oz)', type: 'number'}),
    defineField({name: 'shippingCost', title: 'Shipping Cost', type: 'number'}),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      trackingNumber: 'trackingNumber',
      carrier: 'carrier',
      status: 'status',
    },
    prepare(selection) {
      const title = selection.trackingNumber || 'Shipment'
      const carrier = selection.carrier ? ` · ${selection.carrier.toUpperCase()}` : ''
      return {
        title,
        subtitle: `${selection.status || 'pending'}${carrier}`,
      }
    },
  },
})
