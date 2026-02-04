import {defineType, defineField} from 'sanity'

export const addOnType = defineType({
  name: 'addOn',
  title: 'Custom Upgrade',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      type: 'string',
      title: 'Upgrade Name',
      description: 'E.g., "Ceramic Coating", "Extended Warranty"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'priceDelta',
      type: 'number',
      title: 'Price Adjustment ($)',
      description: 'Additional cost (use positive number)',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 2,
      title: 'Description',
      description: 'Why should they add this upgrade?',
    }),
    defineField({
      name: 'skuSuffix',
      type: 'string',
      title: 'SKU Suffix',
      description: 'Optional suffix (e.g., -CERAMIC)',
    }),
    defineField({
      name: 'defaultSelected',
      type: 'boolean',
      title: 'Pre-selected by Default?',
      initialValue: false,
    }),
    // Medusa Sync Metadata (read-only)
    defineField({
      name: 'medusaOptionId',
      type: 'string',
      title: 'Medusa Option ID',
      description: 'Synced from Medusa product option',
      readOnly: true,
      hidden: ({parent}) => !parent?.medusaOptionId,
    }),
    defineField({
      name: 'medusaOptionValueId',
      type: 'string',
      title: 'Medusa Option Value ID',
      description: 'Synced from Medusa option value',
      readOnly: true,
      hidden: ({parent}) => !parent?.medusaOptionValueId,
    }),
    defineField({
      name: 'syncedPriceCents',
      type: 'number',
      title: 'Synced Price (cents)',
      description: 'Price delta synced to Medusa (in cents)',
      readOnly: true,
      hidden: ({parent}) => !parent?.syncedPriceCents,
    }),
    defineField({
      name: 'lastSyncedAt',
      type: 'datetime',
      title: 'Last Synced',
      description: 'When this addOn was last synced to Medusa',
      readOnly: true,
      hidden: ({parent}) => !parent?.lastSyncedAt,
    }),
    defineField({
      name: 'syncStatus',
      type: 'string',
      title: 'Sync Status',
      description: 'Current sync status with Medusa',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Synced', value: 'synced'},
          {title: 'Error', value: 'error'},
        ],
      },
      initialValue: 'pending',
      readOnly: true,
      hidden: ({parent}) => !parent?.syncStatus || parent?.syncStatus === 'pending',
    }),
  ],
  preview: {
    select: {
      label: 'label',
      priceDelta: 'priceDelta',
      description: 'description',
    },
    prepare({label, priceDelta, description}) {
      const price = typeof priceDelta === 'number' ? `+$${priceDelta.toFixed(2)}` : 'No price'
      return {
        title: label || 'Unnamed Upgrade',
        subtitle: `${price} • ${description || 'No description'}`,
      }
    },
  },
})
