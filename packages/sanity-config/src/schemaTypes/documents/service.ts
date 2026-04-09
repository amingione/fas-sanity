import {defineField, defineType} from 'sanity'

const SERVICE_CATEGORY_OPTIONS = [
  {title: 'Engine', value: 'engine'},
  {title: 'Transmission', value: 'transmission'},
  {title: 'Suspension', value: 'suspension'},
  {title: 'Brakes', value: 'brakes'},
  {title: 'Electrical', value: 'electrical'},
  {title: 'Exhaust', value: 'exhaust'},
  {title: 'Tuning', value: 'tuning'},
  {title: 'Tires & Wheels', value: 'tires_wheels'},
  {title: 'Detailing', value: 'detailing'},
  {title: 'Fabrication', value: 'fabrication'},
  {title: 'Diagnostic', value: 'diagnostic'},
  {title: 'Other', value: 'other'},
]

export default defineType({
  name: 'service',
  title: 'Services',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Service Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {list: SERVICE_CATEGORY_OPTIONS},
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'estimatedDuration',
      title: 'Estimated Duration (hours)',
      type: 'number',
    }),
    defineField({
      name: 'basePrice',
      title: 'Base Price',
      type: 'number',
      description: 'Starting price in USD',
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      name: 'name',
      category: 'category',
      active: 'active',
    },
    prepare({name, category, active}) {
      return {
        title: name || 'Service',
        subtitle: [category, active === false ? '(inactive)' : undefined].filter(Boolean).join(' · '),
      }
    },
  },
})
