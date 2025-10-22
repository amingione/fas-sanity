import { defineField, defineType } from 'sanity'

export const arenaSyncConfigType = defineType({
  name: 'arenaSyncConfig',
  title: 'Are.na Sync Configuration',
  type: 'document',
  fields: [
    defineField({
      name: 'channelSlugs',
      title: 'Are.na Channel Slugs to Sync',
      type: 'array',
      of: [
        {
          type: 'string',
          validation: Rule =>
            Rule.regex(/^[a-z0-9-_]+$/, {name: 'slug'}).error(
              'Slugs should only contain lowercase letters, numbers, hyphens, and underscores.'
            ),
        },
      ],
      description: 'Enter the slugs of the Are.na channels you want to sync.',
      validation: Rule => Rule.unique().error('Channel slugs must be unique.'),
    }),
    defineField({
      name: 'lastSyncDate',
      title: 'Last Sync Attempt Date',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'lastSyncStatus',
      title: 'Last Sync Status Message',
      type: 'text',
      rows: 5,
      readOnly: true,
    }),
    defineField({
      name: 'lastSyncRunId',
      title: 'Last Sync Run ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'lastSuccessfullySyncedSlugs',
      title: 'Last Successfully Synced Channel Slugs',
      description:
        'List of channel slugs that were part of the last fully successful sync operation. Managed by the sync script.',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
    }),
    defineField({
      name: 'syncEndpoint',
      title: 'Sync Endpoint',
      type: 'url',
      description: 'Where the Studio tool POSTs to trigger a sync',
    }),
  ],
  initialValue: () => ({
    _id: 'arenaSyncConfig',
    channelSlugs: [],
    lastSuccessfullySyncedSlugs: [],
  }),
})

export default arenaSyncConfigType
