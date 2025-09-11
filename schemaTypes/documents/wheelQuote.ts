

import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'wheelQuote',
  title: 'Wheel Quote',
  type: 'document',
  fields: [
    // Meta
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      initialValue: 'belak',
      readOnly: true,
    }),
    defineField({
      name: 'pageContext',
      title: 'Page Context',
      type: 'string',
      description: 'wheels | skinnies | series2 | series3',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
    defineField({
    name: 'attachments',
    title: 'Attachments',
    type: 'array',
    of: [{ type: 'reference', to: [{ type: 'sanity.imageAsset' }, { type: 'sanity.fileAsset' }] }],
    }),

    // Customer
    defineField({ name: 'fullname', title: 'Full Name', type: 'string', validation: (r) => r.required().min(2) }),
    defineField({ name: 'email', title: 'Email', type: 'string', validation: (r) => r.required().email() }),
    defineField({ name: 'phone', title: 'Phone', type: 'string' }),

    // Vehicle
    defineField({ name: 'vehicleYear', title: 'Vehicle Year', type: 'string' }),
    defineField({ name: 'vehicleMake', title: 'Vehicle Make', type: 'string' }),
    defineField({ name: 'vehicleModel', title: 'Vehicle Model', type: 'string' }),

    // Wheel selection
    defineField({
      name: 'series',
      title: 'Belak Series',
      type: 'string',
      options: { list: ['Series 2', 'Series 3'] },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'diameter', title: 'Diameter (in)', type: 'number', validation: (r) => r.required().integer() }),
    defineField({ name: 'width', title: 'Width (in)', type: 'number', validation: (r) => r.required() }),
    defineField({
      name: 'boltPattern',
      title: 'Bolt Pattern',
      type: 'string',
      options: { list: ['4x100','4x108','4x114.3','5x100','5x112','5x114.3','5x120','5x4.50','5x4.75','6x4.5'] },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'backspacing', title: 'Backspacing', type: 'string', description: 'e.g., 2.25" (skinny), 7.5 in, S550 Mustang' }),
    defineField({
      name: 'finish',
      title: 'Finish',
      type: 'string',
      options: { list: [
        'Two-Tone Black/Machined (standard)',
        'Raw/Bare (for custom coat)',
        'Custom Powder Coat - Stage 1 (one solid color)',
        'Custom Powder Coat - Stage 2 (two-stage/complex)'
      ] },
    }),
    defineField({ name: 'beadlock', title: 'Beadlock', type: 'string', options: { list: ['None','Single Beadlock','Double Beadlock'] } }),
    defineField({ name: 'hardware', title: 'Hardware', type: 'string', options: { list: ['Standard ARP','Upgraded ARP (color)','Black hardware','Polished hardware'] } }),
    defineField({ name: 'centerCap', title: 'Center Cap', type: 'string', options: { list: ['Standard','Black','Polished','Color-matched'] } }),

    // Quantities
    defineField({ name: 'qtyFront', title: 'Qty Front', type: 'number', initialValue: 2 }),
    defineField({ name: 'qtyRear', title: 'Qty Rear', type: 'number', initialValue: 2 }),

    // Tires & clearance
    defineField({ name: 'tireSizeFront', title: 'Tire Size (Front)', type: 'string' }),
    defineField({ name: 'tireSizeRear', title: 'Tire Size (Rear)', type: 'string' }),
    defineField({ name: 'brakeClearanceNotes', title: 'Brake Clearance Notes', type: 'text' }),

    // Notes & compliance
    defineField({ name: 'notes', title: 'Notes', type: 'text' }),
    defineField({ name: 'agreeTrackUseOnly', title: 'Track Use Only Acknowledged', type: 'boolean' }),

    // Workflow (optional)
    defineField({ name: 'status', title: 'Status', type: 'string', options: { list: ['new','contacted','quoted','won','lost'] }, initialValue: 'new' }),
  ],
  preview: {
    select: {
      title: 'fullname',
      series: 'series',
      diameter: 'diameter',
      width: 'width',
      boltPattern: 'boltPattern',
      createdAt: 'createdAt',
    },
    prepare(sel) {
      const title = sel.title ? `${sel.title} — ${sel.series} ${sel.diameter}x${sel.width}` : `${sel.series} ${sel.diameter}x${sel.width}`
      const subtitle = `${sel.boltPattern || ''} • ${sel.createdAt ? new Date(sel.createdAt).toLocaleString() : ''}`
      return { title, subtitle }
    },
  },
})