import {defineField, defineType} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'
import VendorQuotePricingWatcher from '../../components/studio/VendorQuotePricingWatcher'

const API_VERSION = '2024-10-01'

export default defineType({
  name: 'vendorQuote',
  title: 'Vendor Quote',
  type: 'document',
  groups: [
    {name: 'details', title: 'Details', default: true},
    {name: 'items', title: 'Items'},
    {name: 'totals', title: 'Totals'},
  ],
  fields: [
    defineField({
      name: 'quoteNumber',
      title: 'Quote Number',
      type: 'string',
      readOnly: true,
      components: {input: ReferenceCodeInput},
      group: 'details',
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateReferenceCode(client, {
          prefix: 'VQ-',
          typeName: 'vendorQuote',
          fieldName: 'quoteNumber',
        })
      },
    }),
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
      group: 'details',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: '📝 Draft', value: 'draft'},
          {title: '📤 Sent', value: 'sent'},
          {title: '✅ Approved', value: 'approved'},
          {title: '🚚 Converted', value: 'converted'},
          {title: '❌ Rejected', value: 'rejected'},
          {title: '⏰ Expired', value: 'expired'},
        ],
      },
      initialValue: 'draft',
      group: 'details',
    }),
    defineField({
      name: 'pricingTier',
      title: 'Pricing Tier',
      type: 'string',
      options: {
        list: [
          {title: 'Standard', value: 'standard'},
          {title: 'Preferred', value: 'preferred'},
          {title: 'Platinum', value: 'platinum'},
          {title: 'Custom', value: 'custom'},
        ],
      },
      initialValue: 'standard',
      group: 'details',
    }),
    defineField({
      name: 'customDiscountPercentage',
      title: 'Custom Discount %',
      type: 'number',
      hidden: ({document}) => document?.pricingTier !== 'custom',
      validation: (Rule) => Rule.min(0).max(100),
      group: 'details',
    }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      group: 'items',
      of: [
        defineField({
          type: 'object',
          name: 'item',
          fields: [
            defineField({
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{type: 'product'}],
            }),
            defineField({name: 'description', title: 'Description', type: 'string'}),
            defineField({name: 'quantity', title: 'Quantity', type: 'number', validation: (Rule) => Rule.min(1)}),
            defineField({
              name: 'unitPrice',
              title: 'Unit Price',
              type: 'number',
              readOnly: true,
            }),
            defineField({
              name: 'subtotal',
              title: 'Subtotal',
              type: 'number',
              readOnly: true,
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'pricingWatcher',
      title: 'Pricing Watcher',
      type: 'string',
      hidden: true,
      readOnly: true,
      components: {input: VendorQuotePricingWatcher},
    }),
    defineField({
      name: 'subtotal',
      title: 'Subtotal',
      type: 'number',
      readOnly: true,
      group: 'totals',
    }),
    defineField({
      name: 'tax',
      title: 'Tax',
      type: 'number',
      group: 'totals',
    }),
    defineField({
      name: 'shipping',
      title: 'Shipping',
      type: 'number',
      group: 'totals',
      initialValue: 0,
    }),
    defineField({
      name: 'total',
      title: 'Total',
      type: 'number',
      readOnly: true,
      group: 'totals',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 4,
      group: 'details',
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
      group: 'details',
    }),
    defineField({
      name: 'validUntil',
      title: 'Valid Until',
      type: 'date',
      group: 'details',
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'string',
      group: 'details',
    }),
    defineField({
      name: 'approvedAt',
      title: 'Approved At',
      type: 'datetime',
      group: 'details',
    }),
    defineField({
      name: 'sentAt',
      title: 'Sent At',
      type: 'datetime',
      readOnly: true,
      group: 'details',
    }),
    defineField({
      name: 'rejectedAt',
      title: 'Rejected At',
      type: 'datetime',
      readOnly: true,
      group: 'details',
    }),
    defineField({
      name: 'convertedToOrder',
      title: 'Converted Order',
      type: 'reference',
      to: [{type: 'order'}],
      readOnly: true,
      group: 'details',
    }),
  ],
  preview: {
    select: {
      title: 'quoteNumber',
      status: 'status',
    },
    prepare({title, status}) {
      return {
        title: title || 'Vendor Quote',
        subtitle: status || 'draft',
      }
    },
  },
})
