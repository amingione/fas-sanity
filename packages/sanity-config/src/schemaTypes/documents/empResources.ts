import {defineField, defineType} from 'sanity'
import {DocumentTextIcon} from '@sanity/icons'

export default defineType({
  name: 'empResources',
  title: 'Employee Resource',
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
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Policies', value: 'policies'},
          {title: 'Training', value: 'training'},
          {title: 'Forms', value: 'forms'},
          {title: 'Announcements', value: 'announcements'},
          {title: 'Benefits', value: 'benefits'},
          {title: 'Other', value: 'other'},
        ],
      },
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
            {
              name: 'alt',
              type: 'string',
              title: 'Alternative text',
            },
            {
              name: 'caption',
              type: 'string',
              title: 'Caption',
            },
          ],
        },
        {
          type: 'file',
          name: 'fileDownload',
          title: 'Downloadable File',
          options: {
            accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip',
          },
        },
        {
          type: 'object',
          name: 'checkbox',
          title: 'Checkbox',
          fields: [
            {name: 'label', type: 'string', title: 'Label'},
            {name: 'checked', type: 'boolean', title: 'Checked', initialValue: false},
          ],
        },
        {
          type: 'object',
          name: 'toggle',
          title: 'Toggle',
          fields: [
            {name: 'label', type: 'string', title: 'Label'},
            {name: 'enabled', type: 'boolean', title: 'Enabled', initialValue: false},
          ],
        },
      ],
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      description: 'Upload PDFs, images, and other files',
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
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
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
      description: 'Lower numbers appear first',
      initialValue: 0,
    }),
  ],
  orderings: [
    {
      title: 'Sort Order',
      name: 'sortOrder',
      by: [{field: 'sortOrder', direction: 'asc'}],
    },
    {
      title: 'Title A-Z',
      name: 'titleAsc',
      by: [{field: 'title', direction: 'asc'}],
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
      category: 'category',
      publishedAt: 'publishedAt',
    },
    prepare({title, category, publishedAt}) {
      return {
        title: title,
        subtitle: `${category || 'Uncategorized'} ${publishedAt ? '• ' + new Date(publishedAt).toLocaleDateString() : ''}`,
      }
    },
  },
})
