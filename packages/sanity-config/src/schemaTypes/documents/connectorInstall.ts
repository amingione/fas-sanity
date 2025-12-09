import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'connectorInstall',
  title: 'Connector Install',
  type: 'document',
  fields: [
    defineField({
      name: 'connectorName',
      title: 'Connector',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'workspace',
      title: 'Workspace',
      type: 'reference',
      to: [{type: 'workspace'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pack',
      title: 'Pack',
      type: 'reference',
      to: [{type: 'integrationPack'}],
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Installed', value: 'installed'},
          {title: 'Uninstalled', value: 'uninstalled'},
        ],
      },
      initialValue: 'installed',
    }),
    defineField({
      name: 'installedAt',
      title: 'Installed At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'connectorName',
      subtitle: 'status',
    },
  },
})
