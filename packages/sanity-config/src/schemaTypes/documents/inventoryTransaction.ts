import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'inventoryTransaction',
  title: 'Inventory Transaction',
  type: 'document',
  fields: [
    defineField({
      name: 'transactionNumber',
      title: 'Transaction Number',
      type: 'string',
      readOnly: true,
      description: 'Auto-generated reference (IT-XXXXXX)',
    }),
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          {title: '📥 Received', value: 'received'},
          {title: '📤 Sold', value: 'sold'},
          {title: '🔧 Used in Service', value: 'used'},
          {title: '📦 Reserved', value: 'reserved'},
          {title: '🔄 Returned', value: 'returned'},
          {title: '🗑️ Damaged/Lost', value: 'adjustment'},
          {title: '🏭 Manufactured', value: 'manufactured'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'quantityBefore',
      title: 'Quantity Before',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'quantityAfter',
      title: 'Quantity After',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'unitCost',
      title: 'Unit Cost',
      type: 'number',
    }),
    defineField({
      name: 'totalValue',
      title: 'Total Value',
      type: 'number',
      readOnly: true,
      description: 'Calculated as quantity × unit cost',
    }),
    defineField({
      name: 'reference',
      title: 'Reference',
      type: 'string',
      description: 'Order number, work order, etc.',
    }),
    defineField({
      name: 'referenceDoc',
      title: 'Reference Document',
      type: 'reference',
      to: [{type: 'order'}, {type: 'workOrder'}, {type: 'manufacturingOrder'}],
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'string',
    }),
    defineField({
      name: 'transactionDate',
      title: 'Transaction Date',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'product.title',
      type: 'type',
      quantity: 'quantity',
      transactionNumber: 'transactionNumber',
    },
    prepare({title, type, quantity, transactionNumber}) {
      return {
        title: `${transactionNumber || ''} ${title || 'Inventory Movement'}`.trim(),
        subtitle: `${type || 'movement'} • Qty ${quantity ?? 0}`,
      }
    },
  },
})
