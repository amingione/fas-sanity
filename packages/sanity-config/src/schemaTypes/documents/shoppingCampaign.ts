import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'shoppingCampaign',
  title: 'Shopping Campaign',
  type: 'document',
  fields: [
    defineField({name: 'campaign', title: 'Campaign Name', type: 'string'}),
    defineField({
      name: 'campaignKey',
      title: 'Campaign Key',
      type: 'string',
      description: 'Auto-generated slug used to link attribution data.',
      readOnly: true,
      hidden: true,
    }),
    defineField({name: 'adGroup', title: 'Ad Group', type: 'string'}),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({name: 'cpcBid', title: 'CPC Bid', type: 'number'}),
    defineField({name: 'roasTarget', title: 'ROAS Target', type: 'number'}),
    defineField({name: 'performanceScore', title: 'Performance Score', type: 'number'}),
    defineField({name: 'utmSource', title: 'UTM Source', type: 'string', readOnly: true}),
    defineField({name: 'utmMedium', title: 'UTM Medium', type: 'string', readOnly: true}),
    defineField({
      name: 'linkedProduct',
      title: 'Linked Product',
      type: 'reference',
      to: [{type: 'product'}],
    }),
    defineField({
      name: 'orders',
      title: 'Linked Orders',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'order'}]}],
      readOnly: true,
    }),
    defineField({
      name: 'metrics',
      title: 'Performance Metrics',
      type: 'object',
      readOnly: true,
      fields: [
        {name: 'orderCount', title: 'Orders', type: 'number', readOnly: true},
        {name: 'revenueTotal', title: 'Revenue (USD)', type: 'number', readOnly: true},
        {name: 'lastOrderAt', title: 'Last Order', type: 'datetime', readOnly: true},
      ],
    }),
  ],
})
