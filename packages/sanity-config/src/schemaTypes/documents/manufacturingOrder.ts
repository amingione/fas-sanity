import {defineField, defineType} from 'sanity'

const MO_STATUS_OPTIONS = [
  {title: 'Queued', value: 'queued'},
  {title: 'In Production', value: 'in_production'},
  {title: 'Completed', value: 'completed'},
  {title: 'Cancelled', value: 'cancelled'},
]

const PRIORITY_OPTIONS = [
  {title: 'Urgent', value: 'urgent'},
  {title: 'High', value: 'high'},
  {title: 'Normal', value: 'normal'},
  {title: 'Low', value: 'low'},
]

export default defineType({
  name: 'manufacturingOrder',
  title: 'Manufacturing Orders',
  type: 'document',
  fields: [
    defineField({
      name: 'moNumber',
      title: 'MO Number',
      type: 'string',
      description: 'Auto-generated (MO-XXXXXX). Do not edit manually.',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: MO_STATUS_OPTIONS},
      initialValue: 'queued',
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {list: PRIORITY_OPTIONS},
      initialValue: 'normal',
    }),
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'quantityOrdered', title: 'Quantity Ordered', type: 'number'}),
    defineField({name: 'quantityCompleted', title: 'Quantity Completed', type: 'number', initialValue: 0}),
    defineField({name: 'quantityRemaining', title: 'Quantity Remaining', type: 'number'}),
    defineField({name: 'scheduledStart', title: 'Scheduled Start', type: 'datetime'}),
    defineField({name: 'actualCompletion', title: 'Actual Completion', type: 'datetime'}),
    defineField({name: 'actualHours', title: 'Actual Hours', type: 'number'}),
    defineField({name: 'assignedTo', title: 'Assigned To', type: 'string'}),
    defineField({name: 'createdBy', title: 'Created By', type: 'string', readOnly: true}),
    defineField({name: 'reason', title: 'Reason', type: 'string'}),
    defineField({name: 'qualityNotes', title: 'Quality Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      moNumber: 'moNumber',
      productTitle: 'product.title',
      status: 'status',
      quantityOrdered: 'quantityOrdered',
    },
    prepare(selection) {
      const title = selection.moNumber || 'Manufacturing Order'
      const product = selection.productTitle ? ` · ${selection.productTitle}` : ''
      const qty = typeof selection.quantityOrdered === 'number' ? ` · qty ${selection.quantityOrdered}` : ''
      return {
        title,
        subtitle: `${selection.status || 'queued'}${product}${qty}`,
      }
    },
  },
})
