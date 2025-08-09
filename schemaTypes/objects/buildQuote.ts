import { defineType, defineField } from 'sanity';
import { ComposeIcon } from '@sanity/icons';

export const buildQuote = defineType({
  name: 'buildQuote',
  title: 'Build Quote',
  type: 'object',
  fields: [
    defineField({ name: 'vehicleModel', title: 'Vehicle Model', type: 'string' }),
    defineField({ name: 'modifications', title: 'Modifications', type: 'array', of: [{ type: 'string' }] }),
    defineField({ name: 'horsepower', title: 'Horsepower', type: 'number' }),
    defineField({ name: 'price', title: 'Total Price', type: 'number' }),
    defineField({ name: 'userEmail', title: 'User Email', type: 'string' }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
    defineField({
      name: 'modList',
      title: 'Mod List',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'name', title: 'Mod Name', type: 'string' }),
            defineField({ name: 'hpGain', title: 'HP Gain', type: 'number' }),
            defineField({ name: 'price', title: 'Mod Price', type: 'number' }),
          ],
        },
      ],
    }),
    defineField({
      name: 'quoteSent',
      title: 'Quote Sent?',
      type: 'boolean',
      initialValue: false,
    }),
  ],
});