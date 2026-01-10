import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'logDrain',
  title: 'Log Drain',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'string',
      options: {
        list: [
          {title: 'Datadog', value: 'datadog'},
          {title: 'Logflare', value: 'logflare'},
          {title: 'Custom', value: 'custom'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'Endpoint URL',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'headers',
      title: 'HTTP Headers',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'key', title: 'Header Name', type: 'string'}),
            defineField({name: 'value', title: 'Header Value', type: 'string'}),
          ],
        },
      ],
      options: {layout: 'table'},
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'lastTestedAt',
      title: 'Last Tested',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'lastTestResult',
      title: 'Last Test Result',
      type: 'string',
      options: {
        list: [
          {title: 'Success', value: 'success'},
          {title: 'Failed', value: 'failed'},
        ],
      },
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      provider: 'provider',
      enabled: 'enabled',
    },
    prepare(selection) {
      const {title, provider, enabled} = selection
      return {
        title: title || 'Unnamed Drain',
        subtitle: [provider, enabled ? 'Enabled' : 'Disabled'].filter(Boolean).join(' • '),
      }
    },
  },
})
