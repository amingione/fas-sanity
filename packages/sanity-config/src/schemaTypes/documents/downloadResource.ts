import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons'

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
      name: 'file',
      title: 'File',
      type: 'file',
      group: 'content',
      options: {
        storeOriginalFilename: true,
        accept: ['application/pdf', '.pdf', '.zip'],
      },
      validation: (Rule) => Rule.required().error('Select a PDF or ZIP file to upload.'),
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
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      group: 'metadata',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'file.asset',
      subtitle: 'file.asset.originalFilename',
    },
    prepare(selection) {
      const {title, media, subtitle} = selection
      return {
        title: title || '(untitled download)',
        media,
        subtitle: subtitle || 'Download file',
      }
    },
  },
})
