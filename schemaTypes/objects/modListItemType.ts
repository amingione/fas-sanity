import { defineType, defineField } from 'sanity'

export const modListItemType = defineType({
  name: 'modListItem',
  title: 'Mod List Item',
  type: 'object',
  fields: [
    defineField({ name: 'name', title: 'Mod Name', type: 'string' }),
    defineField({ name: 'hpGain', title: 'HP Gain', type: 'number' }),
    defineField({ name: 'price', title: 'Mod Price', type: 'number' }),
  ],
})

