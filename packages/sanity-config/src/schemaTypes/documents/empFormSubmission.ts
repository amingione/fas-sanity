import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons'

export default defineType({
  name: 'empFormSubmission',
  title: 'Form Submission',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    defineField({
      name: 'formId',
      title: 'Form ID',
      type: 'string',
      description: 'The ID of the form that was submitted (e.g., sms-consent-form)',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'formTitle',
      title: 'Form Title',
      type: 'string',
      description: 'Human-readable form name',
      readOnly: true,
    }),
    defineField({
      name: 'employee',
      title: 'Employee',
      type: 'reference',
      to: [{type: 'empProfile'}],
      description: 'Link to employee profile if authenticated',
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'ipAddress',
      title: 'IP Address',
      type: 'string',
      description: 'IP address of the submitter for legal compliance',
      readOnly: true,
    }),
    defineField({
      name: 'userAgent',
      title: 'User Agent',
      type: 'string',
      description: 'Browser/device information',
      readOnly: true,
    }),
    defineField({
      name: 'formData',
      title: 'Form Data',
      type: 'object',
      description: 'The actual form submission data',
      fields: [
        {
          name: 'firstName',
          title: 'First Name',
          type: 'string',
        },
        {
          name: 'lastName',
          title: 'Last Name',
          type: 'string',
        },
        {
          name: 'phoneNumber',
          title: 'Phone Number',
          type: 'string',
        },
        {
          name: 'email',
          title: 'Email',
          type: 'string',
        },
        {
          name: 'smsConsent',
          title: 'SMS Consent',
          type: 'boolean',
        },
        {
          name: 'consentText',
          title: 'Consent Text',
          type: 'text',
          description: 'The exact consent text that was shown to the user',
        },
        {
          name: 'additionalFields',
          title: 'Additional Fields',
          type: 'object',
          description: 'Any other form fields submitted',
          fields: [
            {
              name: 'raw',
              title: 'Raw JSON',
              type: 'text',
              description: 'Arbitrary key/value payload captured as JSON string',
              rows: 4,
            },
          ],
          options: {
            collapsible: true,
            collapsed: true,
          },
          readOnly: true,
        },
      ],
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending Review', value: 'pending'},
          {title: 'Approved', value: 'approved'},
          {title: 'Processed', value: 'processed'},
          {title: 'Rejected', value: 'rejected'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'processedAt',
      title: 'Processed At',
      type: 'datetime',
      description: 'When this submission was processed/approved',
    }),
    defineField({
      name: 'processedBy',
      title: 'Processed By',
      type: 'string',
      description: 'Who processed this submission',
    }),
    defineField({
      name: 'notes',
      title: 'Internal Notes',
      type: 'text',
      description: 'Internal notes about this submission',
      rows: 3,
    }),
  ],
  preview: {
    select: {
      firstName: 'formData.firstName',
      lastName: 'formData.lastName',
      formTitle: 'formTitle',
      submittedAt: 'submittedAt',
      status: 'status',
    },
    prepare({firstName, lastName, formTitle, submittedAt, status}) {
      const name = `${firstName || ''} ${lastName || ''}`.trim() || 'Anonymous'
      const date = submittedAt ? new Date(submittedAt).toLocaleDateString() : ''
      const statusEmojiMap = {
        pending: '⏳',
        approved: '✅',
        processed: '✓',
        rejected: '❌',
      } as const
      const statusEmoji =
        status && status in statusEmojiMap
          ? statusEmojiMap[status as keyof typeof statusEmojiMap]
          : ''

      return {
        title: `${name} - ${formTitle || 'Form Submission'}`,
        subtitle: `${statusEmoji} ${status} • ${date}`,
      }
    },
  },
})
