import {defineField, defineType} from 'sanity'

export const analyticsSettingsType = defineType({
  name: 'analyticsSettings',
  type: 'document',
  title: 'Analytics Settings',
  icon: () => '📊',
  // @ts-expect-error Allow restricting document actions even though the type no longer declares it
  __experimental_actions: ['update', 'publish'],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Settings Title',
      initialValue: 'Analytics Configuration',
      readOnly: true,
    }),
    defineField({
      name: 'googleAnalyticsId',
      type: 'string',
      title: 'Google Analytics 4 ID',
      description: 'GA4 Measurement ID (G-XXXXXXXXXX)',
      validation: (Rule) => Rule.regex(/^G-[A-Z0-9]+$/, {name: 'GA4 ID', invert: false}),
    }),
    defineField({
      name: 'googleTagManagerId',
      type: 'string',
      title: 'Google Tag Manager ID',
      description: 'GTM Container ID (GTM-XXXXXX)',
      validation: (Rule) => Rule.regex(/^GTM-[A-Z0-9]+$/, {name: 'GTM ID', invert: false}),
    }),
    defineField({name: 'facebookPixelId', type: 'string', title: 'Facebook Pixel ID'}),
    defineField({
      name: 'trackingEnabled',
      type: 'boolean',
      title: 'Enable Tracking',
      description: 'Master switch for all analytics tracking',
      initialValue: true,
    }),
    defineField({
      name: 'events',
      type: 'object',
      title: 'Event Tracking',
      fields: [
        {name: 'trackPageViews', type: 'boolean', title: 'Track Page Views', initialValue: true},
        {name: 'trackAddToCart', type: 'boolean', title: 'Track Add to Cart', initialValue: true},
        {name: 'trackCheckoutStarted', type: 'boolean', title: 'Track Checkout Started', initialValue: true},
        {name: 'trackPurchase', type: 'boolean', title: 'Track Purchases', initialValue: true},
        {name: 'trackSearch', type: 'boolean', title: 'Track Search Queries', initialValue: true},
        {name: 'trackProductClicks', type: 'boolean', title: 'Track Product Clicks', initialValue: true},
      ],
    }),
    defineField({
      name: 'reporting',
      type: 'object',
      title: 'Reporting Configuration',
      fields: [
        {
          name: 'updateFrequency',
          type: 'string',
          title: 'Analytics Update Frequency',
          options: {
            list: [
              {title: 'Real-time', value: 'realtime'},
              {title: 'Every 15 minutes', value: '15min'},
              {title: 'Hourly', value: 'hourly'},
              {title: 'Daily', value: 'daily'},
            ],
          },
          initialValue: 'hourly',
        },
        {
          name: 'retentionDays',
          type: 'number',
          title: 'Data Retention (days)',
          description: 'How long to keep detailed analytics data',
          validation: (Rule) => Rule.integer().min(30).max(730),
          initialValue: 365,
        },
      ],
    }),
    defineField({
      name: 'goals',
      type: 'array',
      title: 'Conversion Goals',
      description: 'Define business goals to track',
      of: [
        defineField({
          type: 'object',
          name: 'goal',
          fields: [
            {name: 'name', type: 'string', title: 'Goal Name', validation: (Rule) => Rule.required()},
            {
              name: 'type',
              type: 'string',
              title: 'Goal Type',
              options: {
                list: [
                  {title: 'Revenue Target', value: 'revenue'},
                  {title: 'Order Count', value: 'orders'},
                  {title: 'Conversion Rate', value: 'conversion_rate'},
                  {title: 'Average Order Value', value: 'aov'},
                ],
              },
            },
            {name: 'target', type: 'number', title: 'Target Value'},
            {
              name: 'timeframe',
              type: 'string',
              title: 'Timeframe',
              options: {list: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']},
            },
          ],
          preview: {
            select: {name: 'name', type: 'type', target: 'target'},
            prepare({name, type, target}) {
              return {
                title: name,
                subtitle: `${type}: ${target}`,
              }
            },
          },
        }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Analytics Settings',
      }
    },
  },
})

export default analyticsSettingsType
