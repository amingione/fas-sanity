import {defineType, defineField} from 'sanity'

/**
 * Campaign documents mirror Shopify's "Create Campaign" flow.
 *
 * Integration notes:
 * - Webhooks/APIs: configure an outbound webhook (Project Settings → API → Webhooks)
 *   that listens to `campaign` create/update events. Use the optional `webhookConfig`
 *   fields on each campaign to route payloads or provide auth secrets for the target API.
 * - API consumers can watch for document changes via the Content Lake `listen` endpoint
 *   or trigger Netlify/Edge functions using the webhook payload.
 */
export default defineType({
  name: 'campaign',
  title: 'Campaign',
  type: 'document',
  description:
    'Marketing campaign wrapper used to coordinate goals, attribution, and Shopify performance data.',
  initialValue: {
    status: 'draft',
  },
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Name of the marketing campaign as defined in Shopify.',
      validation: (Rule) => Rule.required().max(120),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description: 'Workflow status used to track whether the campaign is live.',
      options: {
        layout: 'radio',
        direction: 'horizontal',
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Open', value: 'open'},
        ],
      },
      validation: (Rule) => Rule.required(),
      initialValue: 'draft',
    }),
    defineField({
      name: 'channel',
      title: 'Marketing Channel',
      type: 'reference',
      to: [{type: 'marketingChannel'}],
      description:
        'Primary channel associated with this campaign (Google, Facebook, Instagram, Email, Affiliate, etc.)',
    }),
    defineField({
      name: 'startDate',
      title: 'Start Date',
      type: 'datetime',
      description: 'When the campaign is scheduled to begin.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'endDate',
      title: 'End Date',
      type: 'datetime',
      description: 'Optional end date for the campaign. Leave blank for ongoing.',
      validation: (Rule) =>
        Rule.min(Rule.valueOfField('startDate')).warning('End date occurs before start date.'),
    }),
    defineField({
      name: 'attributionModel',
      title: 'Attribution Model',
      type: 'string',
      options: {
        list: [
          {title: 'Last Click (Non Direct)', value: 'last_click_non_direct'},
          {title: 'First Click', value: 'first_click'},
          {title: 'Linear', value: 'linear'},
          {title: 'Time Decay', value: 'time_decay'},
          {title: 'Data Driven', value: 'data_driven'},
        ],
      },
      description: 'Mapping strategy for allocating conversions to this campaign.',
    }),
    defineField({
      name: 'metrics',
      title: 'High-level Metrics',
      type: 'object',
      description: 'Topline performance metrics aggregated from Shopify or your analytics source.',
      fields: [
        defineField({
          name: 'sessions',
          title: 'Sessions',
          type: 'number',
          validation: (Rule) => Rule.min(0),
        }),
        defineField({
          name: 'sales',
          title: 'Sales',
          type: 'number',
          description: 'Gross sales attributed to the campaign.',
          validation: (Rule) => Rule.min(0),
        }),
        defineField({
          name: 'orders',
          title: 'Orders',
          type: 'number',
          validation: (Rule) => Rule.min(0),
        }),
        defineField({
          name: 'avgOrderValue',
          title: 'Average Order Value',
          type: 'number',
          description: 'Average order value in the campaign conversion window.',
          validation: (Rule) => Rule.min(0),
        }),
      ],
    }),
    defineField({
      name: 'channels',
      title: 'Channel & UTM Breakdown',
      type: 'array',
      description:
        'Per-channel performance. Use to mirror Shopify channel analytics or append custom UTM details.',
      of: [
        defineField({
          name: 'channelPerformance',
          type: 'object',
          title: 'Channel Performance',
          fields: [
            defineField({
              name: 'channelName',
              title: 'Channel Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'utm',
              title: 'UTM Parameters',
              type: 'object',
              options: {collapsible: true, collapsed: true},
              fields: [
                defineField({name: 'source', title: 'Source', type: 'string'}),
                defineField({name: 'medium', title: 'Medium', type: 'string'}),
                defineField({name: 'campaign', title: 'Campaign', type: 'string'}),
                defineField({name: 'term', title: 'Term', type: 'string'}),
                defineField({name: 'content', title: 'Content', type: 'string'}),
              ],
            }),
            defineField({
              name: 'sessions',
              title: 'Sessions',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'orders',
              title: 'Orders',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'sales',
              title: 'Sales',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'orders',
      title: 'Orders Breakdown',
      type: 'object',
      description: 'Orders segmented by customer lifecycle stage.',
      fields: [
        defineField({
          name: 'newOrders',
          title: 'New Customers',
          type: 'number',
          validation: (Rule) => Rule.min(0),
        }),
        defineField({
          name: 'returningOrders',
          title: 'Returning Customers',
          type: 'number',
          validation: (Rule) => Rule.min(0),
        }),
      ],
    }),
    defineField({
      name: 'products',
      title: 'Product Breakdown',
      type: 'array',
      description:
        'Tie Shopify product performance back to Sanity references for richer reporting.',
      of: [
        defineField({
          name: 'productPerformance',
          type: 'object',
          title: 'Product Performance',
          fields: [
            defineField({
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{type: 'product'}],
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'unitsSold',
              title: 'Units Sold',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'sales',
              title: 'Sales',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'deviceAnalytics',
      title: 'Device Analytics',
      type: 'array',
      of: [
        defineField({
          name: 'devicePerformance',
          type: 'object',
          title: 'Device Performance',
          options: {collapsible: true, collapsed: true},
          fields: [
            defineField({
              name: 'deviceType',
              title: 'Device Type',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'sessions',
              title: 'Sessions',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'sales',
              title: 'Sales',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'orders',
              title: 'Orders',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'locationAnalytics',
      title: 'Location Analytics',
      type: 'array',
      of: [
        defineField({
          name: 'locationPerformance',
          type: 'object',
          title: 'Location Performance',
          options: {collapsible: true, collapsed: true},
          fields: [
            defineField({
              name: 'location',
              title: 'Location (Country/Region/City)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'sessions',
              title: 'Sessions',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'sales',
              title: 'Sales',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: 'orders',
              title: 'Orders',
              type: 'number',
              validation: (Rule) => Rule.min(0),
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'description',
      title: 'Description / Notes',
      type: 'text',
      rows: 4,
      description: 'Operational notes, Shopify launch checklist items, or retro summaries.',
    }),
    defineField({
      name: 'webhookConfig',
      title: 'Webhook Configuration',
      type: 'object',
      description:
        'Optional override for outbound API calls. When populated, use these details inside your webhook handler to call downstream services.',
      options: {collapsible: true, collapsed: true},
      fields: [
        defineField({
          name: 'enabled',
          title: 'Enable outbound call',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'endpoint',
          title: 'Endpoint URL',
          type: 'url',
          description: 'HTTPS endpoint to receive POST payloads when this campaign changes.',
        }),
        defineField({
          name: 'method',
          title: 'HTTP Method',
          type: 'string',
          initialValue: 'POST',
          options: {
            list: [
              {title: 'POST', value: 'POST'},
              {title: 'PUT', value: 'PUT'},
              {title: 'PATCH', value: 'PATCH'},
            ],
          },
        }),
        defineField({
          name: 'secret',
          title: 'Shared Secret (optional)',
          type: 'string',
          description: 'Send along with outbound requests for verification.',
        }),
        defineField({
          name: 'customHeaders',
          title: 'Custom Headers',
          type: 'array',
          of: [
            defineField({
              name: 'header',
              type: 'object',
              fields: [
                defineField({
                  name: 'key',
                  title: 'Header Name',
                  type: 'string',
                  validation: (Rule) => Rule.required(),
                }),
                defineField({
                  name: 'value',
                  title: 'Value',
                  type: 'string',
                  validation: (Rule) => Rule.required(),
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      status: 'status',
      startDate: 'startDate',
      endDate: 'endDate',
    },
    prepare({title, status, startDate, endDate}) {
      const period =
        startDate && endDate
          ? `${new Date(startDate).toLocaleDateString()} → ${new Date(endDate).toLocaleDateString()}`
          : startDate
            ? `Starts ${new Date(startDate).toLocaleDateString()}`
            : 'No schedule'
      return {
        title: title || 'Untitled campaign',
        subtitle: `${status ? status.toUpperCase() : 'UNKNOWN'} · ${period}`,
      }
    },
  },
})
