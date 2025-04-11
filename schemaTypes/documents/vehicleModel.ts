import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'vehicleModel',
  title: 'Vehicle Model',
  type: 'document',
  fields: [
    defineField({ name: 'make', type: 'string', title: 'Make' }),
    defineField({ name: 'model', type: 'string', title: 'Model' }),
    defineField({ name: 'yearRange', type: 'string', title: 'Year Range' })
  ]
})