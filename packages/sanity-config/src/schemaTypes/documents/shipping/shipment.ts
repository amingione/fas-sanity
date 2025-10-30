import {defineArrayMember, defineField, defineType} from 'sanity'

const dimensionsField = defineField({
  name: 'dimensions',
  title: 'Dimensions',
  type: 'object',
  fields: [
    defineField({name: 'lengthIn', title: 'Length (in)', type: 'number'}),
    defineField({name: 'widthIn', title: 'Width (in)', type: 'number'}),
    defineField({name: 'heightIn', title: 'Height (in)', type: 'number'}),
  ],
})

export default defineType({
  name: 'shipment',
  title: 'Shipment',
  type: 'document',
  fields: [
    defineField({
      name: 'order',
      title: 'Order',
      type: 'reference',
      to: [{type: 'order'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'carrier', title: 'Carrier', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'service', title: 'Service', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'packageType', title: 'Package type', type: 'string'}),
    defineField({name: 'weightOz', title: 'Weight (oz)', type: 'number'}),
    dimensionsField,
    defineField({name: 'insuredValue', title: 'Insured value', type: 'number'}),
    defineField({
      name: 'rateId',
      title: 'Rate ID',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'rateAmount', title: 'Rate amount', type: 'number'}),
    defineField({
      name: 'labelStatus',
      title: 'Label status',
      type: 'string',
      options: {
        list: [
          {title: 'Purchased', value: 'purchased'},
          {title: 'Voided', value: 'voided'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'labelUrl', title: 'Label URL', type: 'url'}),
    defineField({name: 'packingSlipUrl', title: 'Packing slip URL', type: 'url'}),
    defineField({name: 'trackingNumber', title: 'Tracking number', type: 'string'}),
    defineField({name: 'trackingUrl', title: 'Tracking URL', type: 'url'}),
    defineField({name: 'purchasedAt', title: 'Purchased at', type: 'datetime'}),
    defineField({name: 'voidedAt', title: 'Voided at', type: 'datetime'}),
    defineField({name: 'shipmentKey', title: 'Shipment key', type: 'string'}),
    defineField({
      name: 'errors',
      title: 'Errors',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
  ],
})
