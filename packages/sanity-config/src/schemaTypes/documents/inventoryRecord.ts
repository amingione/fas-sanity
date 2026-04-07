import {defineField, defineType} from 'sanity'

const SOURCE_OPTIONS = [
  {title: 'Purchased', value: 'purchased'},
  {title: 'Manufactured', value: 'manufactured'},
  {title: 'Consigned', value: 'consigned'},
]

export default defineType({
  name: 'inventoryRecord',
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
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {list: SOURCE_OPTIONS},
      initialValue: 'purchased',
    }),
    defineField({
      name: 'quantityOnHand',
      title: 'Quantity On Hand',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'quantityAvailable',
      title: 'Quantity Available',
      type: 'number',
      initialValue: 0,
      description: 'On hand minus reserved.',
      readOnly: true,
    }),
    defineField({
      name: 'quantityInProduction',
      title: 'Quantity In Production',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'reorderQuantity',
      title: 'Reorder Quantity',
      type: 'number',
      description: 'Default quantity when creating a manufacturing or purchase order.',
    }),
    defineField({name: 'unitCost', title: 'Unit Cost', type: 'number'}),
    defineField({name: 'lastRestocked', title: 'Last Restocked', type: 'datetime'}),
    defineField({
      name: 'lowStockAlert',
      title: 'Low Stock Alert',
      type: 'boolean',
      initialValue: false,
      description: 'Set automatically when quantityAvailable falls below reorder threshold.',
    }),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      productTitle: 'product.title',
      productSku: 'product.sku',
      quantityOnHand: 'quantityOnHand',
      lowStockAlert: 'lowStockAlert',
    },
    prepare(selection) {
      const title = selection.productTitle || 'Inventory Record'
      const sku = selection.productSku ? ` (${selection.productSku})` : ''
      const qty = typeof selection.quantityOnHand === 'number' ? ` · ${selection.quantityOnHand} on hand` : ''
      const alert = selection.lowStockAlert ? ' ⚠ Low Stock' : ''
      return {
        title: `${title}${sku}`,
        subtitle: `${qty}${alert}`.trim(),
      }
    },
  },
})
