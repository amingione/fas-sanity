import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vehicle',
  title: 'Vehicles',
  type: 'document',
  fields: [
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
    }),
    defineField({
      name: 'make',
      title: 'Make',
      type: 'string',
    }),
    defineField({
      name: 'model',
      title: 'Model',
      type: 'string',
    }),
    defineField({
      name: 'trim',
      title: 'Trim',
      type: 'string',
    }),
    defineField({
      name: 'vin',
      title: 'VIN',
      type: 'string',
    }),
    defineField({
      name: 'color',
      title: 'Color',
      type: 'string',
    }),
    defineField({
      name: 'mileage',
      title: 'Mileage',
      type: 'number',
    }),
    defineField({
      name: 'owner',
      title: 'Owner',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
    }),
  ],
  preview: {
    select: {
      year: 'year',
      make: 'make',
      model: 'model',
      vin: 'vin',
    },
    prepare({year, make, model, vin}) {
      return {
        title: [year, make, model].filter(Boolean).join(' ') || 'Vehicle',
        subtitle: vin ? `VIN: ${vin}` : undefined,
      }
    },
  },
})
