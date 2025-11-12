import {defineType, defineField} from 'sanity'
import OrderCartItemMetadataInput from '../../components/inputs/OrderCartItemMetadataInput'

export const orderCartItemType = defineType({
  name: 'orderCartItem',
  title: 'Cart Item',
  type: 'object',
  fields: [
    // Primary display
    defineField({name: 'name', type: 'string', title: 'Display Name'}),
    defineField({
      name: 'productRef',
      type: 'reference',
      title: 'Sanity Product',
      to: [{type: 'product'}],
      readOnly: false,
    }),
    defineField({name: 'sku', type: 'string', title: 'SKU'}),
    // Secondary identifiers (read-only)
    defineField({name: 'id', type: 'string', title: 'Product ID / Slug', readOnly: true}),
    defineField({name: 'productSlug', type: 'string', title: 'Product Slug', readOnly: true}),
    defineField({name: 'stripeProductId', type: 'string', title: 'Stripe Product ID', readOnly: true, hidden: true}),
    defineField({name: 'stripePriceId', type: 'string', title: 'Stripe Price ID', readOnly: true, hidden: true}),
    defineField({
      name: 'productName',
      type: 'string',
      title: 'Stripe Product Name',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'description',
      type: 'string',
      title: 'Stripe Line Description',
      readOnly: true,
      hidden: true,
    }),
    defineField({name: 'image', type: 'url', title: 'Product Image URL', readOnly: true}),
    defineField({name: 'productUrl', type: 'string', title: 'Product URL', readOnly: true}),
    
    defineField({
      name: 'optionSummary',
      type: 'string',
      title: 'Selected Options',
      readOnly: true,
      hidden: true,
    }),
    // Keep metadata for internal compatibility, but hide from Studio
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      readOnly: true,
      hidden: true,
      fields: [
        {name: 'option_summary', title: 'Option Summary', type: 'string'},
        {
          name: 'upgrades',
          title: 'Upgrades / Add-Ons',
          type: 'array',
          of: [{type: 'string'}],
          options: {layout: 'tags'},
        },
      ],
    }),
    defineField({
      name: 'optionDetails',
      type: 'array',
      title: 'Options',
      readOnly: true,
      of: [{type: 'string'}],
      options: {layout: 'tags'},
    }),
    defineField({
      name: 'upgrades',
      type: 'array',
      title: 'Upgrades',
      readOnly: true,
      of: [{type: 'string'}],
      options: {layout: 'tags'},
    }),
    defineField({name: 'price', type: 'number', title: 'Unit Price'}),
    defineField({name: 'quantity', type: 'number', title: 'Quantity'}),
    defineField({name: 'lineTotal', type: 'number', title: 'Line Total', readOnly: true}),
    defineField({
      name: 'total',
      type: 'number',
      title: 'Item Total (incl. adjustments)',
      readOnly: true,
    }),
    // Not needed for packing; hide from UI
    defineField({
      name: 'categories',
      title: 'Category Tags',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'validationIssues',
      title: 'Validation Issues',
      type: 'array',
      readOnly: true,
      hidden: true,
      of: [{type: 'string'}],
      options: {layout: 'tags'},
    }),
    defineField({
      name: 'metadataEntries',
      title: 'Raw Metadata',
      type: 'array',
      of: [{type: 'orderCartItemMeta'}],
      components: {
        input: OrderCartItemMetadataInput,
      },
      readOnly: true,
      hidden: true,
    }),
  ],
})
