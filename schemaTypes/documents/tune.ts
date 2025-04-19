import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'tune',
  title: 'Tune',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', title: 'Tune Name' }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 }
    }),
    defineField({ name: 'description', type: 'text', title: 'Description' }),
    defineField({ name: 'estimatedHPGain', type: 'number', title: 'Estimated HP Gain' })
  ]
})