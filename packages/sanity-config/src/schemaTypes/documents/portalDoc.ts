import {defineField, defineType} from 'sanity'
import {DocumentTextIcon} from '@sanity/icons'

export default defineType({
  name: 'portalDoc',
  title: 'Portal Document',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'documentType',
      title: 'Document Type',
      type: 'string',
      options: {
        list: [
          {title: 'Announcement', value: 'announcement'},
          {title: 'Policy', value: 'policy'},
          {title: 'Form', value: 'form'},
          {title: 'Blog Post', value: 'blog'},
          {title: 'Update', value: 'update'},
          {title: 'Folder', value: 'folder'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [
        {type: 'block'},
        {
          type: 'image',
          options: {hotspot: true},
          fields: [
            {name: 'alt', type: 'string', title: 'Alternative text'},
            {name: 'caption', type: 'string', title: 'Caption'},
          ],
        },
        {
          type: 'file',
          name: 'fileDownload',
          title: 'Downloadable File',
        },
        {
          type: 'object',
          name: 'formField',
          title: 'Form Field',
          fields: [
            {name: 'label', type: 'string', title: 'Label'},
            {
              name: 'fieldType',
              type: 'string',
              title: 'Field Type',
              options: {
                list: ['text', 'email', 'number', 'checkbox', 'textarea'],
              },
            },
            {name: 'required', type: 'boolean', title: 'Required'},
          ],
        },
      ],
    }),
    defineField({
      name: 'visibility',
      title: 'Visibility',
      type: 'string',
      options: {
        list: [
          {title: 'All Employees', value: 'all'},
          {title: 'Management Only', value: 'management'},
          {title: 'Specific Departments', value: 'departments'},
        ],
      },
      initialValue: 'all',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
    }),
    defineField({
      name: 'expiresAt',
      title: 'Expires At',
      type: 'datetime',
      description: 'Optional expiration date for time-sensitive content',
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {
        list: [
          {title: 'Low', value: 'low'},
          {title: 'Normal', value: 'normal'},
          {title: 'High', value: 'high'},
          {title: 'Urgent', value: 'urgent'},
        ],
      },
      initialValue: 'normal',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {
        layout: 'tags',
      },
    }),
    defineField({
      name: 'sortOrder',
      title: 'Sort Order',
      type: 'number',
      description: 'Lower numbers appear first (drag to reorder)',
      initialValue: 0,
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [
        {
          type: 'file',
          options: {
            accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx',
          },
        },
      ],
    }),
    defineField({
      name: 'canvaLink',
      title: 'Canva Link',
      type: 'url',
      description: 'Link to Canva design',
    }),
    defineField({
      name: 'requiresAcknowledgment',
      title: 'Requires Acknowledgment',
      type: 'boolean',
      description: 'Employees must acknowledge they have read this document',
      initialValue: false,
    }),
    defineField({
      name: 'acknowledgedBy',
      title: 'Acknowledged By',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'employee'}]}],
      readOnly: true,
    }),
  ],
  orderings: [
    {
      title: 'Sort Order',
      name: 'sortOrder',
      by: [{field: 'sortOrder', direction: 'asc'}],
    },
    {
      title: 'Priority',
      name: 'priority',
      by: [{field: 'priority', direction: 'desc'}],
    },
    {
      title: 'Published Date, New',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      documentType: 'documentType',
      priority: 'priority',
    },
    prepare({title, documentType, priority}) {
      return {
        title: title,
        subtitle: `${documentType || 'Document'} ${priority === 'urgent' || priority === 'high' ? '• ' + priority.toUpperCase() : ''}`,
      }
    },
  },
})
