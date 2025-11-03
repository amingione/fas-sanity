import {defineField, defineType} from 'sanity'

export const dashboardViewType = defineType({
  name: 'dashboardView',
  title: 'Dashboard View',
  type: 'document',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      description: 'Optional internal label for this dashboard view.',
      hidden: true,
    }),
  ],
  hidden: true,
  preview: {
    prepare: () => ({
      title: 'Dashboard View',
    }),
  },
})
