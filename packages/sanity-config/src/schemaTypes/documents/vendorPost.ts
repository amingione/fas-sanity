import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorPost',
  title: 'Vendor Post',
  type: 'document',
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
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'postType',
      title: 'Post Type',
      type: 'string',
      options: {
        list: [
          {title: '📢 Announcement', value: 'announcement'},
          {title: '🚨 Important Notice', value: 'notice'},
          {title: '🆕 New Release', value: 'release'},
          {title: '📋 Policy Update', value: 'policy'},
          {title: '💡 Tip & Best Practice', value: 'tip'},
          {title: '📰 General Update', value: 'update'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {
        list: [
          {title: 'Normal', value: 'normal'},
          {title: 'High', value: 'high'},
          {title: 'Urgent', value: 'urgent'},
        ],
      },
      initialValue: 'normal',
      description: 'Urgent posts will be pinned at the top',
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      description: 'Brief summary shown in list view',
      validation: (Rule) => Rule.required().max(200),
    }),
    defineField({
      name: 'featuredImage',
      title: 'Featured Image',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
            {title: 'H4', value: 'h4'},
            {title: 'Quote', value: 'blockquote'},
          ],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
              {title: 'Code', value: 'code'},
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [{name: 'href', type: 'url', title: 'URL'}],
              },
            ],
          },
        },
        {type: 'image', options: {hotspot: true}},
        {type: 'code', title: 'Code Block'},
      ],
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description: 'Link to products mentioned in this post',
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [
        {
          type: 'file',
          fields: [
            {name: 'title', type: 'string', title: 'Title'},
            {name: 'description', type: 'string', title: 'Description'},
          ],
        },
      ],
      description: 'PDFs, spreadsheets, or other files',
    }),
    defineField({
      name: 'notifyVendors',
      title: 'Send Email Notification',
      type: 'boolean',
      initialValue: false,
      description: 'Send email to all vendors when published',
    }),
    defineField({
      name: 'pinned',
      title: 'Pin to Top',
      type: 'boolean',
      initialValue: false,
      description: 'Keep this post at the top of the list',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{type: 'user'}],
      description: 'Staff member who wrote this post',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      description: 'Leave empty to save as draft',
    }),
    defineField({
      name: 'expiresAt',
      title: 'Expires At',
      type: 'datetime',
      description: 'Optional: Hide post after this date',
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'vendorPostCategory'}]}],
    }),
  ],
  orderings: [
    {
      title: 'Published Date, New',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
    {
      title: 'Priority',
      name: 'priorityDesc',
      by: [
        {field: 'priority', direction: 'desc'},
        {field: 'publishedAt', direction: 'desc'},
      ],
    },
  ],
  preview: {
    select: {
      title: 'title',
      type: 'postType',
      priority: 'priority',
      published: 'publishedAt',
      media: 'featuredImage',
    },
    prepare({title, type, priority, published, media}) {
      const typeEmoji: Record<string, string> = {
        announcement: '📢',
        notice: '🚨',
        release: '🆕',
        policy: '📋',
        tip: '💡',
        update: '📰',
      }
      const priorityBadge = priority === 'urgent' ? '🔴' : priority === 'high' ? '🟡' : ''
      return {
        title: `${priorityBadge} ${typeEmoji[type || ''] || ''} ${title || 'Post'}`,
        subtitle: published ? new Date(published).toLocaleDateString() : 'Draft',
        media,
      }
    },
  },
})
