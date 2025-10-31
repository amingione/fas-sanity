// /schemas/marketing/marketingChannel.ts
import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'marketingChannel',
  title: 'Marketing Channel',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Channel Name',
      type: 'string',
      options: {
        list: [
          {title: 'Google Ads', value: 'google_ads'},
          {title: 'Facebook / Meta', value: 'facebook'},
          {title: 'Email', value: 'email'},
          {title: 'Affiliate', value: 'affiliate'},
          {title: 'Direct', value: 'direct'},
        ],
      },
    }),
    defineField({
      name: 'apiKey',
      title: 'API Key',
      type: 'string',
      description: 'Stored securely as env var or vault reference',
    }),
    defineField({
      name: 'accountId',
      title: 'Account / Pixel ID',
      type: 'string',
    }),
    defineField({
      name: 'endpoint',
      title: 'API Endpoint',
      type: 'url',
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
  ],
})
