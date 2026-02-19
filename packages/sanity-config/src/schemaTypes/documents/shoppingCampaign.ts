import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'shoppingCampaign',
  title: 'Shopping Campaign',
  type: 'document',
  description: 'Marketing planning and attribution metadata only. Commerce conversion is measured in Medusa.',
  fields: [
    defineField({name: 'campaign', title: 'Campaign Name', type: 'string'}),
    defineField({name: 'campaignKey', title: 'Campaign Key', type: 'string', readOnly: true, hidden: true}),
    defineField({name: 'adGroup', title: 'Ad Group', type: 'string'}),
    defineField({name: 'sku', title: 'SKU Label', type: 'string'}),
    defineField({name: 'cpcBid', title: 'CPC Bid', type: 'number'}),
    defineField({name: 'roasTarget', title: 'ROAS Target', type: 'number'}),
    defineField({name: 'performanceScore', title: 'Performance Score', type: 'number'}),
    defineField({name: 'utmSource', title: 'UTM Source', type: 'string', readOnly: true}),
    defineField({name: 'utmMedium', title: 'UTM Medium', type: 'string', readOnly: true}),
    defineField({name: 'linkedProduct', title: 'Linked Product', type: 'reference', to: [{type: 'product'}]}),
    defineField({
      name: 'metrics',
      title: 'Performance Metrics',
      type: 'object',
      readOnly: true,
      fields: [
        {name: 'conversionCount', title: 'Conversions', type: 'number', readOnly: true},
        {name: 'attributedRevenueDisplay', title: 'Attributed Revenue (Display)', type: 'number', readOnly: true},
        {name: 'lastConversionAt', title: 'Last Conversion', type: 'datetime', readOnly: true},
      ],
    }),
  ],
})
