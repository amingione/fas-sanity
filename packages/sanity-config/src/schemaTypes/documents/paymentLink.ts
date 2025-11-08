import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'paymentLink',
  title: 'Stripe Payment Link',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string'}),
    defineField({
      name: 'stripePaymentLinkId',
      title: 'Stripe Payment Link ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({name: 'status', title: 'Status', type: 'string', readOnly: true}),
    defineField({name: 'url', title: 'Payment URL', type: 'url', readOnly: true}),
    defineField({name: 'livemode', title: 'Live Mode', type: 'boolean', readOnly: true}),
    defineField({name: 'active', title: 'Active', type: 'boolean', readOnly: true}),
    defineField({
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      readOnly: true,
    }),
    defineField({
      name: 'quoteRef',
      title: 'Quote',
      type: 'reference',
      to: [{type: 'quote'}],
      readOnly: true,
    }),
    defineField({
      name: 'orderRef',
      title: 'Order',
      type: 'reference',
      to: [{type: 'order'}],
      readOnly: true,
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'array',
      of: [{type: 'stripeMetadataEntry'}],
      readOnly: true,
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [{type: 'orderCartItem'}],
      readOnly: true,
    }),
    defineField({name: 'afterCompletion', title: 'After Completion', type: 'text', readOnly: true}),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      url: 'url',
      status: 'status',
    },
    prepare({title, url, status}) {
      const headline = title || url || 'Payment Link'
      const subtitle = [status, url].filter(Boolean).join(' • ')
      return {title: headline, subtitle: subtitle || undefined}
    },
  },
})
