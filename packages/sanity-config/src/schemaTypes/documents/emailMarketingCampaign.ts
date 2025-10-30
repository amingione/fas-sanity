import {EnvelopeIcon, MegaphoneIcon} from '@sanity/icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {validateSlug} from '../../utils/validateSlug'

export const emailMarketingCampaignType = defineType({
  name: 'emailMarketingCampaign',
  title: 'Email Marketing Campaign',
  type: 'document',
  icon: MegaphoneIcon,
  groups: [
    {
      default: true,
      name: 'planning',
      title: 'Planning',
      icon: MegaphoneIcon,
    },
    {
      name: 'creative',
      title: 'Creative Assets',
      icon: EnvelopeIcon,
    },
    {
      name: 'performance',
      title: 'Performance',
      icon: EnvelopeIcon,
    },
  ],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'planning',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {
        source: 'title',
      },
      validation: validateSlug,
      group: 'planning',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      group: 'planning',
      options: {
        layout: 'radio',
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Building', value: 'building'},
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'Sent', value: 'sent'},
          {title: 'Needs Follow-up', value: 'needs_follow_up'},
          {title: 'Archived', value: 'archived'},
        ],
      },
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'campaignGoal',
      title: 'Primary Goal',
      type: 'string',
      description: 'Summarize what success looks like for this send (e.g. registrations, product launches, backlink requests).',
      group: 'planning',
    }),
    defineField({
      name: 'sendDate',
      title: 'Target Send Date',
      type: 'datetime',
      description: 'Schedule this send or note when it went live.',
      group: 'planning',
    }),
    defineField({
      name: 'audienceSegments',
      title: 'Audience Segments',
      description: 'Reference saved segments or document custom segment logic used for the send.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'filterTag'}],
          title: 'Saved Segment',
        }),
        defineArrayMember({
          type: 'string',
          name: 'customSegment',
          title: 'Custom Segment',
        }),
      ],
      group: 'planning',
    }),
    defineField({
      name: 'automationPlatform',
      title: 'Automation Platform',
      type: 'string',
      description: 'Note the ESP or automation workflow powering this campaign.',
      group: 'planning',
    }),
    defineField({
      name: 'workflowLink',
      title: 'Automation / ESP Link',
      type: 'url',
      description: 'Paste the URL to the campaign inside your ESP for quick access.',
      group: 'planning',
      validation: (Rule) =>
        Rule.uri({allowRelative: false, scheme: ['https']}).warning('Use a secure (https) campaign link.'),
    }),
    defineField({
      name: 'canvaTemplateUrl',
      title: 'Canva Design URL',
      type: 'url',
      description: 'Link to the Canva template or design used for this campaign.',
      group: 'creative',
      validation: (Rule) =>
        Rule.uri({allowRelative: false, scheme: ['https']}).warning('Share the Canva template using an https link.'),
    }),
    defineField({
      name: 'designPreview',
      title: 'Design Preview',
      type: 'image',
      options: {
        hotspot: true,
      },
      description: 'Upload a thumbnail or hero image exported from Canva for quick reference.',
      group: 'creative',
    }),
    defineField({
      name: 'subjectLine',
      title: 'Subject Line',
      type: 'string',
      validation: (Rule) => Rule.required().min(5).max(120),
      group: 'creative',
    }),
    defineField({
      name: 'previewText',
      title: 'Preview Text',
      type: 'string',
      description: 'Inbox preheader copy that pairs with the subject line.',
      validation: (Rule) => Rule.max(160),
      group: 'creative',
    }),
    defineField({
      name: 'contentOutline',
      title: 'Content Outline',
      type: 'portableTextSimple',
      description: 'Outline hero copy, supporting paragraphs, and modules to mirror the Canva design.',
      group: 'creative',
    }),
    defineField({
      name: 'ctaLabel',
      title: 'Primary Call to Action',
      type: 'string',
      group: 'creative',
    }),
    defineField({
      name: 'ctaUrl',
      title: 'CTA URL',
      type: 'url',
      description: 'Destination URL used for the main call to action.',
      group: 'creative',
      validation: (Rule) =>
        Rule.uri({allowRelative: false, scheme: ['https']}).warning('Use a tracked, secure link for the CTA.'),
    }),
    defineField({
      name: 'utmParameters',
      title: 'UTM Parameters',
      type: 'string',
      description: 'Document the tracking parameters appended to campaign links.',
      group: 'planning',
    }),
    defineField({
      name: 'teamNotes',
      title: 'Team Notes & Approvals',
      type: 'text',
      rows: 3,
      description: 'Capture approvals, QA feedback, and any additional reminders.',
      group: 'planning',
    }),
    defineField({
      name: 'postSendSummary',
      title: 'Post-send Summary',
      type: 'text',
      rows: 4,
      description: 'Document learnings, competitive responses, or next steps after the send.',
      group: 'performance',
    }),
    defineField({
      name: 'performanceGoals',
      title: 'Performance Goals',
      type: 'object',
      options: {
        collapsible: true,
        collapsed: true,
      },
      group: 'performance',
      fields: [
        defineField({
          name: 'openRate',
          title: 'Open Rate Goal (%)',
          type: 'number',
        }),
        defineField({
          name: 'clickRate',
          title: 'Click Rate Goal (%)',
          type: 'number',
        }),
        defineField({
          name: 'conversionGoal',
          title: 'Conversion Goal',
          type: 'string',
        }),
        defineField({
          name: 'revenueGoal',
          title: 'Revenue Goal',
          type: 'number',
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'subjectLine',
      media: 'designPreview',
      status: 'status',
      sendDate: 'sendDate',
    },
    prepare({media, title, subtitle, status, sendDate}) {
      const statusLabel = status ? status.replace(/_/g, ' ') : 'status unknown'
      const schedule = sendDate ? new Date(sendDate).toLocaleDateString() : 'No send date set'

      return {
        media,
        title: title || 'Untitled Email Campaign',
        subtitle: `${statusLabel} • ${subtitle || schedule}`,
      }
    },
  },
})
