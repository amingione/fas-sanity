import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons'

export default defineType({
  name: 'senderAddress',
  title: 'Sender Address',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    defineField({
      name: 'nickname',
      title: 'Nickname',
      type: 'string',
      validation: (Rule) => Rule.required().max(80),
    }),
    defineField({
      name: 'isDefaultSender',
      title: 'Default Sender',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'isDefaultReturn',
      title: 'Default Return',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'verified',
      title: 'Verified',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'street1',
      title: 'Street 1',
      type: 'string',
      validation: (Rule) => Rule.required().max(100),
    }),
    defineField({
      name: 'street2',
      title: 'Street 2',
      type: 'string',
      validation: (Rule) => Rule.max(100),
    }),
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      validation: (Rule) => Rule.required().max(50),
    }),
    defineField({
      name: 'state',
      title: 'State',
      type: 'string',
      validation: (Rule) => Rule.required().length(2),
    }),
    defineField({
      name: 'postalCode',
      title: 'Postal Code',
      type: 'string',
      validation: (Rule) => Rule.required().max(10),
    }),
    defineField({
      name: 'country',
      title: 'Country',
      type: 'string',
      initialValue: 'US',
      validation: (Rule) => Rule.required().length(2),
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
      validation: (Rule) => Rule.max(20),
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.email(),
    }),
  ],
  preview: {
    select: {
      title: 'nickname',
      street1: 'street1',
      city: 'city',
      state: 'state',
      postalCode: 'postalCode',
      country: 'country',
    },
    prepare({title, street1, city, state, postalCode, country}) {
      const parts = [street1, city, state, postalCode, country].filter(Boolean)
      return {
        title: title || 'Sender Address',
        subtitle: parts.length ? parts.join(', ') : undefined,
      }
    },
  },
})
