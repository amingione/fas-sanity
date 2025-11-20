import {defineField, defineType} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

export default defineType({
  name: 'manufacturingOrder',
  title: 'Manufacturing Order',
  type: 'document',
  fields: [
    defineField({
      name: 'moNumber',
      title: 'MO Number',
      type: 'string',
      readOnly: true,
      components: {input: ReferenceCodeInput},
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateReferenceCode(client, {
          prefix: 'MO-',
          typeName: 'manufacturingOrder',
          fieldName: 'moNumber',
        })
      },
    }),
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'quantityOrdered',
      title: 'Quantity Ordered',
      type: 'number',
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'quantityCompleted',
      title: 'Quantity Completed',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'quantityRemaining',
      title: 'Quantity Remaining',
      type: 'number',
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: '📋 Queued', value: 'queued'},
          {title: '🏭 In Production', value: 'in_production'},
          {title: '⏸️ On Hold', value: 'on_hold'},
          {title: '✅ Completed', value: 'completed'},
          {title: '❌ Cancelled', value: 'cancelled'},
        ],
      },
      initialValue: 'queued',
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {
        list: [
          {title: '🔴 Urgent', value: 'urgent'},
          {title: '🟡 High', value: 'high'},
          {title: '🟢 Normal', value: 'normal'},
          {title: '⚪ Low', value: 'low'},
        ],
      },
      initialValue: 'normal',
    }),
    defineField({
      name: 'assignedTo',
      title: 'Assigned To',
      type: 'string',
      description: 'Staff member or team',
    }),
    defineField({
      name: 'workstation',
      title: 'Workstation/Area',
      type: 'string',
    }),
    defineField({
      name: 'scheduledStart',
      title: 'Scheduled Start',
      type: 'datetime',
    }),
    defineField({
      name: 'scheduledCompletion',
      title: 'Scheduled Completion',
      type: 'datetime',
    }),
    defineField({
      name: 'actualStart',
      title: 'Actual Start',
      type: 'datetime',
    }),
    defineField({
      name: 'actualCompletion',
      title: 'Actual Completion',
      type: 'datetime',
    }),
    defineField({
      name: 'estimatedHours',
      title: 'Estimated Hours',
      type: 'number',
    }),
    defineField({
      name: 'actualHours',
      title: 'Actual Hours',
      type: 'number',
    }),
    defineField({
      name: 'materialsNeeded',
      title: 'Materials Needed',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'material', title: 'Material', type: 'string'}),
            defineField({name: 'quantity', title: 'Quantity', type: 'number'}),
            defineField({name: 'unit', title: 'Unit', type: 'string'}),
            defineField({
              name: 'available',
              title: 'Available',
              type: 'boolean',
              initialValue: true,
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'qualityNotes',
      title: 'Quality Control Notes',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'string',
    }),
    defineField({
      name: 'reason',
      title: 'Reason',
      type: 'string',
      description: 'Why this production run? (restock, custom order, etc.)',
    }),
  ],
  preview: {
    select: {
      moNumber: 'moNumber',
      product: 'product.title',
      status: 'status',
      quantityOrdered: 'quantityOrdered',
      quantityRemaining: 'quantityRemaining',
    },
    prepare({moNumber, product, status, quantityOrdered, quantityRemaining}) {
      return {
        title: `${moNumber || 'MO'} • ${product || 'Product'}`,
        subtitle: `${status || 'queued'} • Ordered ${quantityOrdered ?? 0} | Remaining ${quantityRemaining ?? 0}`,
      }
    },
  },
})
