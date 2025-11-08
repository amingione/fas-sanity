import {defineField, defineType} from 'sanity'

export const stripeMetadataEntryType = defineType({
  name: 'stripeMetadataEntry',
  title: 'Stripe Metadata Entry',
  type: 'object',
  fields: [
    defineField({name: 'key', title: 'Key', type: 'string'}),
    defineField({name: 'value', title: 'Value', type: 'string'}),
  ],
  preview: {
    select: {key: 'key', value: 'value'},
    prepare({key, value}) {
      return {
        title: key || '(empty key)',
        subtitle: value || '',
      }
    },
  },
})
