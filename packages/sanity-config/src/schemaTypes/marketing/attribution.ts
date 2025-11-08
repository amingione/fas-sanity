import {defineType, defineField} from 'sanity'

/**
 * Attribution documents represent the rolled-up performance metrics that we ingest from
 * external ad / email / affiliate platforms. Each document captures a reporting window and
 * is idempotent via the `externalId` field so that CRON / scheduled Netlify jobs can
 * upsert metrics without producing duplicates.
 */
export default defineType({
  name: 'attribution',
  title: 'Marketing Attribution',
  type: 'document',
  description:
    'Daily (or per-sync) marketing attribution metrics collected from paid, organic, email, and affiliate channels.',
  fields: [
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      description: 'Data provider that produced this attribution snapshot.',
      options: {
        list: [
          {title: 'Google Ads', value: 'google_ads'},
          {title: 'Facebook / Meta', value: 'facebook'},
          {title: 'Instagram', value: 'instagram'},
          {title: 'Email Campaign', value: 'email'},
          {title: 'Klaviyo', value: 'klaviyo'},
          {title: 'SendGrid', value: 'sendgrid'},
          {title: 'Affiliate Network', value: 'affiliate'},
          {title: 'Direct / Organic', value: 'organic'},
        ],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'externalId',
      title: 'External Record ID',
      type: 'string',
      description: 'Provider unique ID (campaign/ad set/report row) used for idempotent upserts.',
    }),
    defineField({
      name: 'syncDate',
      title: 'Sync Timestamp',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      description: 'When this row was fetched from the source API.',
    }),
    defineField({
      name: 'dateRange',
      title: 'Reporting Window',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        defineField({name: 'start', title: 'Start', type: 'datetime'}),
        defineField({name: 'end', title: 'End', type: 'datetime'}),
      ],
      description: 'Optional start/end window. Leave blank for single-day metrics.',
    }),
    defineField({
      name: 'campaign',
      title: 'Campaign',
      type: 'string',
      description: 'UTM campaign or provider campaign name.',
    }),
    defineField({
      name: 'adGroup',
      title: 'Ad Group / Set',
      type: 'string',
      description: 'Optional ad set / ad group level identifier.',
    }),
    defineField({
      name: 'medium',
      title: 'Medium',
      type: 'string',
      description: 'UTM medium (cpc, social, email, affiliate, etc.).',
    }),
    defineField({
      name: 'term',
      title: 'Keyword / Term',
      type: 'string',
      description: 'Search keyword, audience, or segmentation label.',
    }),
    defineField({
      name: 'content',
      title: 'Ad Content / Creative',
      type: 'string',
      description: 'Used to differentiate ads or creatives within a campaign.',
    }),
    defineField({
      name: 'landingPage',
      title: 'Landing Page URL',
      type: 'url',
    }),
    defineField({
      name: 'channel',
      title: 'Marketing Channel',
      type: 'reference',
      to: [{type: 'marketingChannel'}],
      description: 'Optional pointer to the configured marketing channel credentials.',
    }),
    defineField({
      name: 'metrics',
      title: 'Performance Metrics',
      type: 'object',
      description: 'Normalized metrics shared across providers.',
      fields: [
        defineField({name: 'impressions', title: 'Impressions', type: 'number'}),
        defineField({name: 'clicks', title: 'Clicks', type: 'number'}),
        defineField({name: 'sessions', title: 'Sessions', type: 'number'}),
        defineField({name: 'opens', title: 'Email Opens', type: 'number'}),
        defineField({name: 'clickThroughs', title: 'Email Clicks', type: 'number'}),
        defineField({name: 'orders', title: 'Orders', type: 'number'}),
        defineField({name: 'newCustomers', title: 'New Customers', type: 'number'}),
        defineField({name: 'returningCustomers', title: 'Returning Customers', type: 'number'}),
        defineField({name: 'revenue', title: 'Revenue', type: 'number'}),
        defineField({name: 'spend', title: 'Spend', type: 'number'}),
        defineField({name: 'commissions', title: 'Affiliate Commissions', type: 'number'}),
      ],
    }),
    defineField({
      name: 'conversionType',
      title: 'Primary Conversion Type',
      type: 'string',
      options: {
        list: [
          {title: 'Purchase', value: 'purchase'},
          {title: 'Lead', value: 'lead'},
          {title: 'Signup', value: 'signup'},
          {title: 'Form Submit', value: 'form_submit'},
          {title: 'Phone Call', value: 'call'},
        ],
      },
    }),
    defineField({
      name: 'conversionValue',
      title: 'Conversion Value',
      type: 'number',
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
    }),
    defineField({
      name: 'order',
      title: 'Linked Order',
      type: 'reference',
      to: [{type: 'order'}],
    }),
    defineField({
      name: 'sessionId',
      title: 'Session ID',
      type: 'string',
      description: 'Optional analytics or Stripe session ID for drill-downs.',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Sync debug notes, provider error messages, or manual overrides.',
    }),
  ],
  preview: {
    select: {
      title: 'campaign',
      subtitle: 'source',
      date: 'syncDate',
      revenue: 'metrics.revenue',
    },
    prepare({title, subtitle, date, revenue}) {
      const formattedDate = date ? new Date(date).toLocaleDateString() : 'No sync date'
      const revenueLabel =
        typeof revenue === 'number' && Number.isFinite(revenue)
          ? `Revenue $${revenue.toFixed(2)}`
          : null
      return {
        title: title || 'Untitled campaign',
        subtitle: [subtitle || 'unknown source', formattedDate, revenueLabel]
          .filter(Boolean)
          .join(' • '),
      }
    },
  },
})
