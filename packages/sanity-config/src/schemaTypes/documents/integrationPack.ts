import {defineField, defineType} from 'sanity'
import {PackageIcon} from '@sanity/icons'

export default defineType({
  name: 'integrationPack',
  title: 'Integration Pack',
  type: 'document',
  icon: PackageIcon,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      description: 'Semver version of the pack',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'string',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: ['shipping', 'messaging', 'payments', 'analytics', 'utilities'],
      },
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'dependencies',
      title: 'Dependencies',
      type: 'array',
      of: [
        defineField({
          name: 'credentials',
          type: 'object',
          fields: [
            {name: 'name', type: 'string', title: 'Name'},
            {name: 'version', type: 'string', title: 'Version'},
          ],
        }),
      ],
    }),
    defineField({
      name: 'configuration',
      title: 'Configuration',
      type: 'object',
      fields: [
        {name: 'envKeys', type: 'array', of: [{type: 'string'}], title: 'Env Keys'},
        {name: 'testMode', type: 'boolean', title: 'Supports Test Mode'},
      ],
    }),
    defineField({
      name: 'endpoints',
      title: 'Endpoints',
      type: 'array',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'documentation',
      title: 'Documentation (URL)',
      type: 'url',
    }),
    defineField({
      name: 'license',
      title: 'License',
      type: 'string',
    }),
    defineField({
      name: 'repository',
      title: 'Repository',
      type: 'url',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'version',
      media: 'icon',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? `v${subtitle}` : '',
      }
    },
  },
})
