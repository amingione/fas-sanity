import {defineType, defineField} from 'sanity'

export const invoiceLineItemType = defineType({
  name: 'invoiceLineItem',
  title: 'Invoice Line Item',
  type: 'object',
  fields: [
    defineField({name: 'product', title: 'Product', type: 'reference', to: [{type: 'product'}]}),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      initialValue: 1,
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'unitPrice',
      title: 'Unit Price',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'lineTotal',
      title: 'Line Total',
      description: 'Auto-calculated: quantity × unitPrice',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'total',
      title: 'Legacy Line Total',
      type: 'number',
      readOnly: true,
      hidden: true,
      description: 'Deprecated alias of lineTotal kept for backwards compatibility.',
    }),
    defineField({
      name: 'optionSummary',
      title: 'Option Summary',
      type: 'string',
      readOnly: true,
      hidden: true,
      description: 'Readable summary of the selected product options.',
    }),
    defineField({
      name: 'optionDetails',
      title: 'Option Details',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
      hidden: true,
      description: 'Raw option data captured from checkout.',
    }),
    defineField({
      name: 'upgrades',
      title: 'Upgrades',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
      hidden: true,
      description: 'Additional upgrades selected for the line item.',
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      readOnly: true,
      hidden: true,
      options: {collapsible: true},
      fields: [
        defineField({
          name: 'option_summary',
          title: 'Option Summary (Legacy)',
          type: 'string',
          readOnly: true,
        }),
        defineField({
          name: 'upgrades',
          title: 'Upgrades (Legacy)',
          type: 'array',
          of: [{type: 'string'}],
          readOnly: true,
        }),
      ],
    }),
  ],
  preview: {
    select: {title: 'description', qty: 'quantity', price: 'unitPrice', sku: 'sku'},
    prepare({title, qty, price, sku}: any) {
      const label = title || 'Line item'
      return {
        title: `${label}${sku ? ` • ${sku}` : ''} — ${qty || 1} × $${Number(price || 0).toFixed(
          2,
        )}`,
      }
    },
  },
})
