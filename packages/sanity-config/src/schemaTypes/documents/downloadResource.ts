import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons'
import TemplateFlagInput from '../../components/inputs/TemplateFlagInput'

const isFileFocusedType = (documentType?: string | null) =>
  documentType === 'download' || documentType === 'template'

const isContentFocusedType = (documentType?: string | null) =>
  documentType === 'reference' || documentType === 'guide'

const toDocumentType = (value: unknown) => (typeof value === 'string' ? value : undefined)

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
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description:
        'Brief 2-3 sentence summary. Full content goes in the Content field below.',
      group: 'content',
      validation: (Rule) =>
        Rule.custom((description) => {
          if (!description || description.trim().length === 0) {
            return 'Description is required'
          }

          if (description.length > 500) {
            return 'Description should be brief (under 500 characters). Move detailed content to the Content field.'
          }

          return true
        }),
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      description: 'Full document content with rich formatting',
      group: 'content',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H1', value: 'h1'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
            {title: 'H4', value: 'h4'},
            {title: 'Quote', value: 'blockquote'},
          ],
          lists: [
            {title: 'Bullet', value: 'bullet'},
            {title: 'Numbered', value: 'number'},
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
                title: 'URL',
                fields: [
                  {
                    name: 'href',
                    type: 'url',
                  },
                ],
              },
            ],
          },
        },
        {
          type: 'code',
          title: 'Code Block',
          options: {
            language: 'javascript',
            languageAlternatives: [
              {title: 'JavaScript', value: 'javascript'},
              {title: 'TypeScript', value: 'typescript'},
              {title: 'JSON', value: 'json'},
              {title: 'GROQ', value: 'groq'},
              {title: 'HTML', value: 'html'},
              {title: 'CSS', value: 'css'},
              {title: 'Shell', value: 'sh'},
            ],
            withFilename: true,
          },
        },
        {
          type: 'image',
          title: 'Image',
          options: {hotspot: true},
          fields: [
            {
              name: 'alt',
              type: 'string',
              title: 'Alternative text',
              description: 'Important for SEO and accessibility',
            },
            {
              name: 'caption',
              title: 'Caption',
              type: 'string',
            },
          ],
        },
      ],
      validation: (Rule) =>
        Rule.custom((content, context) => {
          const docType = context.document?.documentType

          if (docType === 'guide' && (!content || content.length === 0)) {
            return 'Content is required for guide documents'
          }

          return true
        }),
      hidden: ({document}) => isFileFocusedType(toDocumentType(document?.documentType)),
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
      name: 'version',
      title: 'Version',
      type: 'string',
      group: 'metadata',
      description: 'e.g., v1.0, v2.1',
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
      name: 'file',
      title: 'File',
      type: 'file',
      group: 'content',
      options: {
        storeOriginalFilename: true,
        accept: 'application/pdf,.pdf,.zip',
      },
      description: 'Upload PDF or ZIP assets. Hidden for guides and reference entries.',
      hidden: ({document}) => isContentFocusedType(toDocumentType(document?.documentType)),
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
