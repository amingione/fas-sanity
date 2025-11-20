import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vehicle',
  title: 'Vehicle',
  type: 'document',
  fields: [
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      validation: (Rule) => Rule.min(1900).max(new Date().getFullYear() + 1),
    }),
    defineField({name: 'make', title: 'Make', type: 'string'}),
    defineField({name: 'model', title: 'Model', type: 'string'}),
    defineField({name: 'trim', title: 'Trim', type: 'string'}),
    defineField({
      name: 'vin',
      title: 'VIN',
      type: 'string',
      validation: (Rule) =>
        Rule.min(11)
          .max(17)
          .custom((value) => {
            if (!value) return true
            const isValid = /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(value)
            return isValid || 'Enter a valid VIN (letters + digits, no I/O/Q)'
          }),
    }),
    defineField({
      name: 'mileage',
      title: 'Mileage',
      type: 'number',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({name: 'color', title: 'Color', type: 'string'}),
    defineField({name: 'licensePlate', title: 'License Plate', type: 'string'}),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
    defineField({
      name: 'serviceHistory',
      title: 'Service History',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'workOrder'}]}],
      readOnly: true,
    }),
    defineField({
      name: 'totalServiceCost',
      title: 'Total Service Cost',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'lastServiceDate',
      title: 'Last Service Date',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'nextServiceDue',
      title: 'Next Service Due',
      type: 'date',
      description: 'Recommended next service date',
    }),
    defineField({
      name: 'serviceReminder',
      title: 'Service Reminder',
      type: 'boolean',
      initialValue: true,
      description: 'Send service reminders',
    }),
    defineField({
      name: 'photos',
      title: 'Vehicle Photos',
      type: 'array',
      of: [{type: 'image'}],
    }),
    defineField({
      name: 'modifications',
      title: 'Modifications & Upgrades',
      type: 'text',
      rows: 4,
      description: 'Mods/upgrades installed',
    }),
    defineField({
      name: 'vehicleNotes',
      title: 'Vehicle Notes',
      type: 'text',
      rows: 4,
    }),
  ],
  preview: {
    select: {
      year: 'year',
      make: 'make',
      model: 'model',
      customerName: 'customer.firstName',
      customerLast: 'customer.lastName',
    },
    prepare({year, make, model, customerName, customerLast}) {
      const name = [customerName, customerLast].filter(Boolean).join(' ') || 'Unassigned'
      return {
        title: [year, make, model].filter(Boolean).join(' ') || 'Vehicle',
        subtitle: `Owner: ${name}`,
      }
    },
  },
})
