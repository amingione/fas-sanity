import {defineField, defineType} from 'sanity'
import {GenerateAndPrintPanel, ServiceRateInput} from './shippingLabelComponents'

export default defineType({
  name: 'shippingLabel',
  title: 'Shipping Label',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Label Name',
      type: 'string',
      description: 'Give this label a friendly name for later reference.',
      validation: (Rule) => Rule.required().min(2),
    }),
    defineField({
      name: 'ship_from',
      title: 'Ship From',
      type: 'shipFromAddress',
      options: {collapsible: true, columns: 2},
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'ship_to',
      title: 'Ship To',
      type: 'shipToAddress',
      options: {collapsible: true, columns: 2},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'weight',
      title: 'Weight',
      type: 'shipmentWeight',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'dimensions',
      title: 'Dimensions (inches)',
      type: 'packageDimensions',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'serviceSelection',
      title: 'Service / Rate',
      type: 'string',
      description: 'Live EasyPost rates – choose a service to use for this label.',
      components: {input: ServiceRateInput},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'actions',
      title: 'Generate & Print',
      type: 'string',
      readOnly: true,
      description: 'Create the label and save tracking + label URL.',
      components: {input: GenerateAndPrintPanel},
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'labelUrl',
      title: 'Label URL (PDF)',
      type: 'url',
      readOnly: true,
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'trackingNumber'},
    prepare({title, subtitle}) {
      return {
        title: title || 'Shipping Label',
        subtitle: subtitle ? `Tracking: ${subtitle}` : '—',
      }
    },
  },
})
