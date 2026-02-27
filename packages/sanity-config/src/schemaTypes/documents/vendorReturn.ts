import {defineField, defineType} from 'sanity'

const RETURN_STATUS_OPTIONS = [
  {title: 'Requested', value: 'requested'},
  {title: 'Approved', value: 'approved'},
  {title: 'Received', value: 'received'},
  {title: 'Rejected', value: 'rejected'},
  {title: 'Refunded', value: 'refunded'},
]

export default defineType({
  name: 'vendorReturn',
  title: 'Vendor Returns',
  type: 'document',
  fields: [
    defineField({name: 'returnNumber', title: 'Return Number', type: 'string'}),
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({name: 'orderRef', title: 'Related Order', type: 'reference', to: [{type: 'vendorOrder'}]}),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: RETURN_STATUS_OPTIONS},
      initialValue: 'requested',
    }),
    defineField({name: 'reason', title: 'Reason', type: 'text', rows: 3}),
    defineField({name: 'requestedAt', title: 'Requested At', type: 'datetime'}),
    defineField({name: 'approvedAt', title: 'Approved At', type: 'datetime'}),
    defineField({name: 'refundAmount', title: 'Refund Amount', type: 'number'}),
    defineField({name: 'notes', title: 'Notes', type: 'text', rows: 3}),
  ],
  preview: {
    select: {
      title: 'returnNumber',
      subtitle: 'status',
      vendor: 'vendor.companyName',
    },
    prepare(selection) {
      const title = selection.title || 'Vendor Return'
      const status = selection.subtitle || 'status'
      const vendor = selection.vendor ? ` · ${selection.vendor}` : ''
      return {title, subtitle: `${status}${vendor}`}
    },
  },
})
