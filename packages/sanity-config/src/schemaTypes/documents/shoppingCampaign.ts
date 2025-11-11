import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'shoppingCampaign',
  title: 'Shopping Campaign',
  type: 'document',
  fields: [
    defineField({name: 'campaign', title: 'Campaign Name', type: 'string'}),
    defineField({name: 'adGroup', title: 'Ad Group', type: 'string'}),
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({name: 'cpcBid', title: 'CPC Bid', type: 'number'}),
    defineField({name: 'roasTarget', title: 'ROAS Target', type: 'number'}),
    defineField({name: 'performanceScore', title: 'Performance Score', type: 'number'}),
    defineField({
      name: 'linkedProduct',
      title: 'Linked Product',
      type: 'reference',
      to: [{type: 'product'}],
    }),
  ],
})
