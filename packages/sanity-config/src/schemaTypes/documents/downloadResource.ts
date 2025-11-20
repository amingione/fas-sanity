import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons'
import TemplateFlagInput from '../../components/inputs/TemplateFlagInput'

const isFileFocusedType = (documentType?: string | null) =>
  documentType === 'download' || documentType === 'template'

const isContentFocusedType = (documentType?: string | null) =>
  documentType === 'reference' || documentType === 'guide'

export default defineType({
  name: 'downloadResource',
  title: 'Download',
  type: 'document',
  icon: DocumentIcon,
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'metadata', title: 'Metadata'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required().max(120),
      group: 'content',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      group: 'content',
    }),
    defineField({
      name: 'documentType',
      title: 'Document Type',
      type: 'string',
      group: 'content',
      options: {
        layout: 'radio',
        list: [
          {title: '📥 Download (for customers)', value: 'download'},
          {title: '📋 Template (duplicatable)', value: 'template'},
          {title: '📖 Reference Doc (read-only)', value: 'reference'},
          {title: '📚 Internal Guide', value: 'guide'},
        ],
      },
      initialValue: 'download',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      description: 'Rich text editor for reference docs and guides.',
      group: 'content',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H1', value: 'h1'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
            {title: 'Quote', value: 'blockquote'},
          ],
          lists: [
            {title: 'Bullet', value: 'bullet'},
            {title: 'Numbered', value: 'number'},
            {title: 'Checklist', value: 'checklist'},
          ],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
              {title: 'Underline', value: 'underline'},
              {title: 'Code', value: 'code'},
            ],
            annotations: [
              {
                name: 'link',
                title: 'Link',
                type: 'object',
                fields: [
                  {
                    name: 'href',
                    title: 'URL',
                    type: 'url',
                  },
                  {
                    name: 'openInNewTab',
                    title: 'Open in new tab',
                    type: 'boolean',
                    initialValue: true,
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
              title: 'Alt text',
              type: 'string',
              validation: (Rule) => Rule.max(120),
            },
            {
              name: 'caption',
              title: 'Caption',
              type: 'string',
              validation: (Rule) => Rule.max(200),
            },
          ],
        },
      ],
      hidden: ({document}) => isFileFocusedType(document?.documentType),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      group: 'content',
      options: {
        list: [
          {title: '📢 Marketing Materials', value: 'marketing'},
          {title: '⚙️ Operations', value: 'operations'},
          {title: '🔧 Technical Specs', value: 'technical'},
          {title: '⚖️ Legal Documents', value: 'legal'},
          {title: '📝 Templates', value: 'templates'},
        ],
      },
    }),
    defineField({
      name: 'accessLevel',
      title: 'Who Can Access',
      type: 'string',
      group: 'content',
      options: {
        layout: 'radio',
        list: [
          {title: 'Public (anyone with link)', value: 'public'},
          {title: 'Internal (staff only)', value: 'internal'},
          {title: 'Admin (admin only)', value: 'admin'},
        ],
      },
      initialValue: 'internal',
    }),
    defineField({
      name: 'isTemplate',
      title: 'Template',
      type: 'boolean',
      group: 'content',
      description: 'Enable duplication workflow for reusable document templates.',
      initialValue: false,
      components: {
        input: TemplateFlagInput,
      },
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      group: 'metadata',
      description: 'e.g., v1.0, v2.1',
    }),
    defineField({
      name: 'file',
      title: 'File',
      type: 'file',
      group: 'content',
      options: {
        storeOriginalFilename: true,
        accept: 'application/pdf,.pdf,.zip',
      },
      description: 'Upload PDF or ZIP assets. Hidden for guides and reference entries.',
      hidden: ({document}) => isContentFocusedType(document?.documentType),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      group: 'metadata',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {
        layout: 'tags',
      },
      group: 'metadata',
    }),
    defineField({
      name: 'relatedDocuments',
      title: 'Related Documents',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'downloadResource'}]}],
      group: 'metadata',
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      group: 'metadata',
    }),
    defineField({
      name: 'lastUpdated',
      title: 'Last Updated',
      type: 'datetime',
      group: 'metadata',
      readOnly: true,
      description: 'Automatically updated when the document is saved.',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'isArchived',
      title: 'Archived',
      type: 'boolean',
      group: 'metadata',
      hidden: true,
      initialValue: false,
    }),
    defineField({
      name: 'archivedAt',
      title: 'Archived At',
      type: 'datetime',
      group: 'metadata',
      hidden: true,
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      documentType: 'documentType',
      category: 'category',
      version: 'version',
      media: 'file.asset',
      subtitle: 'file.asset.originalFilename',
    },
    prepare({title, documentType, category, version, media, subtitle}) {
      const typeIcon =
        {
          download: '📥',
          template: '📋',
          reference: '📖',
          guide: '📚',
        }[documentType as 'download' | 'template' | 'reference' | 'guide'] || '📄'
      const categoryLabel =
        {
          marketing: 'Marketing',
          operations: 'Operations',
          technical: 'Technical',
          legal: 'Legal',
          templates: 'Templates',
        }[category as 'marketing' | 'operations' | 'technical' | 'legal' | 'templates'] ||
        'Uncategorized'

      return {
        title: `${typeIcon} ${title || '(untitled download)'}`,
        media,
        subtitle: `${categoryLabel}${version ? ` • ${version}` : ''} ${
          subtitle ? `• ${subtitle}` : ''
        }`.trim(),
      }
    },
  },
})
