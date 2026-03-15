import {defineField, defineType} from 'sanity'

export const stripeMetadataEntryType = defineType({
  name: 'stripeMetadataEntry',
  title: 'Stripe Metadata Entry',
  type: 'object',
  fields: [
    defineField({name: 'key', type: 'string'}),
    defineField({name: 'value', type: 'string'}),
  ],
  preview: {
    select: {title: 'key', subtitle: 'value'},
  },
})
