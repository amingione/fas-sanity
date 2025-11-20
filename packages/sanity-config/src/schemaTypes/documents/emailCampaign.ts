import {defineType, defineField} from 'sanity'
import {EnvelopeIcon} from '@sanity/icons'
import SendCampaignButton from '../../components/SendCampaignButton'

export default defineType({
  name: 'emailCampaign',
  title: 'Email Campaigns',
  type: 'document',
  icon: EnvelopeIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Campaign Name',
      type: 'string',
      description: 'Internal name for this campaign',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'trackingSlug',
      title: 'Tracking Slug',
      type: 'slug',
      description: 'Used for the utm_campaign parameter to connect revenue attribution.',
      options: {
        source: 'title',
        slugify: (input) =>
          input
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''),
      },
    }),
    defineField({
      name: 'subject',
      title: 'Email Subject Line',
      type: 'string',
      validation: (Rule) => Rule.required().max(100),
    }),
    defineField({
      name: 'previewText',
      title: 'Preview Text',
      type: 'string',
      description: 'Text shown in email inbox preview (50-100 characters recommended)',
      validation: (Rule) => Rule.max(150),
    }),
    defineField({
      name: 'fromName',
      title: 'From Name',
      type: 'string',
      initialValue: 'FAS Motorsports',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'fromEmail',
      title: 'From Email',
      type: 'string',
      initialValue: 'orders@fasmotorsports.com',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'replyTo',
      title: 'Reply-To Email',
      type: 'string',
      description: 'Optional: Different email for replies',
    }),
    defineField({
      name: 'segment',
      title: 'Target Audience',
      type: 'string',
      options: {
        list: [
          {title: 'All Email Subscribers', value: 'all_subscribers'},
          {title: 'Recent Customers (Last 30 Days)', value: 'recent_customers'},
          {title: 'VIP Customers (5+ Orders)', value: 'vip_customers'},
          {title: 'First-Time Customers', value: 'first_time_customers'},
          {title: 'Inactive Customers (90+ Days)', value: 'inactive_customers'},
          {title: 'Newsletter Subscribers Only', value: 'newsletter_only'},
          {title: 'Custom GROQ Query', value: 'custom'},
        ],
        layout: 'dropdown',
      },
      initialValue: 'all_subscribers',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'customQuery',
      title: 'Custom GROQ Query',
      type: 'text',
      rows: 4,
      description:
        'Advanced: Write a GROQ query to target specific customers. Must return {email, name} fields.',
      hidden: ({parent}) => parent?.segment !== 'custom',
    }),
    defineField({
      name: 'content',
      title: 'Email Content',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'Heading 1', value: 'h1'},
            {title: 'Heading 2', value: 'h2'},
            {title: 'Heading 3', value: 'h3'},
          ],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  {
                    name: 'href',
                    type: 'url',
                    title: 'URL',
                    validation: (Rule) => Rule.required(),
                  },
                ],
              },
            ],
          },
        },
        {
          type: 'image',
          options: {hotspot: true},
          fields: [
            {
              name: 'alt',
              type: 'string',
              title: 'Alt Text',
              description: 'Important for accessibility',
            },
          ],
        },
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'ctaButton',
      title: 'Call to Action Button',
      type: 'object',
      fields: [
        {
          name: 'text',
          type: 'string',
          title: 'Button Text',
          placeholder: 'Shop Now',
        },
        {
          name: 'url',
          type: 'url',
          title: 'Button URL',
        },
        {
          name: 'color',
          type: 'string',
          title: 'Button Color',
          options: {
            list: [
              {title: 'Primary (Brand)', value: 'primary'},
              {title: 'Secondary', value: 'secondary'},
              {title: 'Success (Green)', value: 'success'},
              {title: 'Danger (Red)', value: 'danger'},
            ],
          },
          initialValue: 'primary',
        },
      ],
    }),
    defineField({
      name: 'status',
      title: 'Campaign Status',
      type: 'string',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'Sending', value: 'sending'},
          {title: 'Sent', value: 'sent'},
          {title: 'Paused', value: 'paused'},
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      readOnly: ({document}) => document?.status === 'sent',
    }),
    defineField({
      name: 'scheduledSendDate',
      title: 'Scheduled Send Date',
      type: 'datetime',
      description: 'Date/time the campaign should start sending.',
      hidden: ({parent}) => parent?.status !== 'scheduled',
    }),
    defineField({
      name: 'testEmail',
      title: 'Test Email Address',
      type: 'string',
      description: 'Send a test email to this address before sending to all subscribers',
      placeholder: 'your-email@example.com',
    }),
    defineField({
      name: 'sentDate',
      title: 'Sent Date',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'recipientCount',
      title: 'Recipients',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'sentCount',
      title: 'Sent Count',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'deliveredCount',
      title: 'Delivered Count',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'openedCount',
      title: 'Opened Count',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'clickedCount',
      title: 'Clicked Count',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'unsubscribedCount',
      title: 'Unsubscribed Count',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'openRate',
      title: 'Open Rate',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'clickRate',
      title: 'Click Rate',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'unsubscribeRate',
      title: 'Unsubscribe Rate',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'stats',
      title: 'Campaign Statistics',
      type: 'object',
      readOnly: true,
      fields: [
        {name: 'recipientCount', type: 'number', title: 'Total Recipients'},
        {name: 'sent', type: 'number', title: 'Successfully Sent'},
        {name: 'failed', type: 'number', title: 'Failed'},
        {name: 'opened', type: 'number', title: 'Opened'},
        {name: 'clicked', type: 'number', title: 'Clicked'},
        {name: 'bounced', type: 'number', title: 'Bounced'},
        {name: 'unsubscribed', type: 'number', title: 'Unsubscribed'},
      ],
    }),
    defineField({
      name: 'sendActions',
      title: 'Send Campaign',
      type: 'string',
      components: {
        input: SendCampaignButton as any,
      },
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subject: 'subject',
      status: 'status',
      sentDate: 'sentDate',
    },
    prepare({
      title,
      subject,
      status,
      sentDate,
    }: {
      title?: string
      subject?: string
      status?: string
      sentDate?: string
    }) {
      const statusMap = {
        draft: '📝',
        scheduled: '🗓️',
        sending: '📤',
        sent: '✅',
        paused: '⏸️',
      } as const

      const statusEmoji = statusMap[status as keyof typeof statusMap] || '📧'

      return {
        title: title,
        subtitle: `${statusEmoji} ${subject}${sentDate ? ` • Sent ${new Date(sentDate).toLocaleDateString()}` : ''}`,
      }
    },
  },
})
