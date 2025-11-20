import {defineField, defineType} from 'sanity'
import {INVENTORY_DOCUMENT_TYPE} from '../../../../../shared/docTypes'

export default defineType({
  name: INVENTORY_DOCUMENT_TYPE,
  title: 'Inventory',
  type: 'document',
  fields: [
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'quantityOnHand',
      title: 'Quantity On Hand',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'quantityReserved',
      title: 'Quantity Reserved',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'quantityAvailable',
      title: 'Quantity Available',
      type: 'number',
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: 'quantityInProduction',
      title: 'In Production',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'reorderPoint',
      title: 'Reorder Point',
      type: 'number',
      description: 'Alert when stock falls below this',
    }),
    defineField({
      name: 'reorderQuantity',
      title: 'Reorder Quantity',
      type: 'number',
      description: 'How many to order/produce',
    }),
    defineField({
      name: 'leadTimeDays',
      title: 'Lead Time (Days)',
      type: 'number',
      description: 'Days to manufacture/receive',
    }),
    defineField({
      name: 'unitCost',
      title: 'Unit Cost',
      type: 'number',
      description: 'Cost to manufacture/purchase one unit',
    }),
    defineField({
      name: 'totalValue',
      title: 'Total Inventory Value',
      type: 'number',
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {
        list: [
          {title: 'Manufactured In-House', value: 'manufactured'},
          {title: 'Purchased from Supplier', value: 'purchased'},
          {title: 'Drop Shipped', value: 'dropship'},
        ],
      },
    }),
    defineField({
      name: 'supplier',
      title: 'Supplier',
      type: 'reference',
      to: [{type: 'vendor'}],
      hidden: ({document}) => document?.source !== 'purchased',
    }),
    defineField({
      name: 'supplierSku',
      title: 'Supplier SKU',
      type: 'string',
    }),
    defineField({
      name: 'location',
      title: 'Storage Location',
      type: 'string',
      description: 'Warehouse location/bin',
    }),
    defineField({
      name: 'lastRestocked',
      title: 'Last Restocked',
      type: 'datetime',
    }),
    defineField({
      name: 'lastSold',
      title: 'Last Sold',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'turnoverRate',
      title: 'Turnover Rate (per year)',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'lowStockAlert',
      title: 'Low Stock Alert',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'outOfStock',
      title: 'Out of Stock',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'overstocked',
      title: 'Overstocked',
      type: 'boolean',
      readOnly: true,
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
      title: 'product.title',
      onHand: 'quantityOnHand',
      available: 'quantityAvailable',
      reorderPoint: 'reorderPoint',
    },
    prepare({title, onHand, available, reorderPoint}) {
      const safeAvailable = typeof available === 'number' ? available : 0
      const safeReorder = typeof reorderPoint === 'number' ? reorderPoint : 0
      const status =
        safeAvailable <= 0 ? '🚨 OUT' : safeAvailable <= safeReorder ? '⚠️ LOW' : '✅'
      return {
        title: `${status} ${title || 'Inventory Item'}`,
        subtitle: `On Hand: ${onHand ?? 0} | Available: ${available ?? 0} | Reorder at: ${reorderPoint ?? 0}`,
      }
    },
  },
})
