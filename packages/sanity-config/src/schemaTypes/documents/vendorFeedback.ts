import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorFeedback',
  title: 'Vendor Feedback',
  type: 'document',
  fields: [
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'period',
      title: 'Period',
      type: 'string',
      description: 'e.g., 2024-Q1, 2024-12',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'qualityScore',
      title: 'Quality Score',
      type: 'number',
      validation: (Rule) => Rule.required().min(1).max(5),
    }),
    defineField({
      name: 'deliveryScore',
      title: 'Delivery Score',
      type: 'number',
      validation: (Rule) => Rule.required().min(1).max(5),
    }),
    defineField({
      name: 'communicationScore',
      title: 'Communication Score',
      type: 'number',
      validation: (Rule) => Rule.required().min(1).max(5),
    }),
    defineField({
      name: 'overallScore',
      title: 'Overall Score',
      type: 'number',
      validation: (Rule) => Rule.required().min(1).max(5),
    }),
    defineField({
      name: 'strengths',
      title: 'Strengths',
      type: 'array',
      of: [{type: 'string'}],
      description: 'What this vendor does well',
    }),
    defineField({
      name: 'improvements',
      title: 'Areas for Improvement',
      type: 'array',
      of: [{type: 'string'}],
      description: 'What this vendor could improve',
    }),
    defineField({
      name: 'comments',
      title: 'Comments',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'string',
      description: 'Staff member who created this feedback',
    }),
  ],
  preview: {
    select: {
      vendor: 'vendor.companyName',
      period: 'period',
      overall: 'overallScore',
    },
    prepare({vendor, period, overall}) {
      return {
        title: `${vendor || 'Vendor'} - ${period || 'Period'}`,
        subtitle: `Overall Score: ${typeof overall === 'number' ? overall : 'N/A'}/5`,
      }
    },
  },
})
