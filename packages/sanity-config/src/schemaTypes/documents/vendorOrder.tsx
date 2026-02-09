import {defineField, defineType} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

export default defineType({
  name: 'vendorOrder',
  title: 'Vendor Order',
  type: 'document',
  groups: [
    {name: 'details', title: 'Details', default: true},
    {name: 'items', title: 'Items'},
    {name: 'totals', title: 'Totals'},
    {name: 'payment', title: 'Payment'},
  ],
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      readOnly: true,
      components: {input: ReferenceCodeInput},
      group: 'details',
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateReferenceCode(client, {
          prefix: 'VO-',
          typeName: 'vendorOrder',
          fieldName: 'orderNumber',
        })
      },
      validation: (Rule) => Rule.required(),
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
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
      group: 'details',
    }),
    defineField({
      name: 'invoiceRef',
      title: 'Invoice',
      type: 'reference',
      to: [{type: 'invoice'}],
      group: 'details',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Sent', value: 'sent'},
          {title: 'Payable', value: 'payable'},
          {title: 'Paid', value: 'paid'},
        ],
      },
      initialValue: 'draft',
      group: 'details',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'paymentStatus',
      title: 'Payment Status',
      type: 'string',
      options: {
        list: [
          {title: 'Unpaid', value: 'unpaid'},
          {title: 'Paid', value: 'paid'},
          {title: 'Failed', value: 'failed'},
        ],
      },
      initialValue: 'unpaid',
      group: 'payment',
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      initialValue: 'USD',
      group: 'totals',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cart',
      title: 'Line Items',
      type: 'array',
      of: [{type: 'orderCartItem'}],
      validation: (Rule) => Rule.required().min(1),
      group: 'items',
    }),
    defineField({
      name: 'amountSubtotal',
      title: 'Subtotal',
      type: 'number',
      group: 'totals',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'amountTax',
      title: 'Tax',
      type: 'number',
      group: 'totals',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'amountShipping',
      title: 'Shipping',
      type: 'number',
      group: 'totals',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'totalAmount',
      title: 'Total',
      type: 'number',
      group: 'totals',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'stripePaymentIntentId',
      title: 'Stripe Payment Intent ID',
      type: 'string',
      readOnly: true,
      group: 'payment',
    }),
    defineField({
      name: 'stripePaymentStatus',
      title: 'Stripe Payment Status',
      type: 'string',
      readOnly: true,
      group: 'payment',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
      group: 'payment',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      group: 'details',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'orderNumber',
      vendor: 'vendor.companyName',
      total: 'totalAmount',
      status: 'status',
    },
    prepare({title, vendor, total, status}) {
      const label = title || 'Vendor Order'
      const detail = vendor ? ` • ${vendor}` : ''
      const amount = typeof total === 'number' ? ` • $${total.toFixed(2)}` : ''
      const state = status ? ` • ${status.toUpperCase()}` : ''
      return {
        title: `${label}${detail}${amount}${state}`,
      }
    },
  },
})
