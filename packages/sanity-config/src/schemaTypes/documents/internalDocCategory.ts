import {defineField, defineType} from 'sanity'
import {FolderIcon} from '@sanity/icons'

export default defineType({
  name: 'internalDocCategory',
  title: 'Internal Doc Category',
  type: 'document',
  icon: FolderIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Category Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'icon',
      title: 'Icon (emoji or short label)',
      type: 'string',
      description: 'e.g. 🔧 or 📋 — shown on the dashboard tile',
    }),
    defineField({
      name: 'color',
      title: 'Accent Color (hex)',
      type: 'string',
      description: 'e.g. #1a56db — used for the category card border/badge',
    }),
    defineField({
      name: 'order',
      title: 'Display Order',
      type: 'number',
      description: 'Lower numbers appear first on the dashboard',
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  orderings: [
    {
      title: 'Display Order',
      name: 'orderAsc',
      by: [{field: 'order', direction: 'asc'}],
    },
  ],
  preview: {
    select: {title: 'title', subtitle: 'description'},
    prepare({title, subtitle}) {
      return {title, subtitle}
    },
  },
})
