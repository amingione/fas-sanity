import {defineField, defineType} from 'sanity'
import {HomeIcon} from '@sanity/icons'

export default defineType({
  name: 'senderAddress',
  title: 'Sender Address',
  type: 'document',
  icon: HomeIcon,
  fields: [
    defineField({
      name: 'nickname',
      title: 'Nickname',
      type: 'string',
      validation: (Rule) => Rule.required().max(50),
    }),
    defineField({
      name: 'isDefaultSender',
      title: 'Default Sender',
      type: 'boolean',
      description: 'Use this address as the default sender for new shipments',
      initialValue: false,
    }),
    defineField({
      name: 'isDefaultReturn',
      title: 'Default Return',
      type: 'boolean',
      description: 'Use this address as the default return address',
      initialValue: false,
    }),
    defineField({
      name: 'verified',
      title: 'Verified',
      type: 'boolean',
      description: 'Set automatically by EasyPost or manually by admin',
      initialValue: false,
    }),
    defineField({
      name: 'street1',
      title: 'Street Address',
      type: 'string',
      validation: (Rule) => Rule.required().max(100),
    }),
    defineField({
      name: 'street2',
      title: 'Unit/Suite',
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
      title: 'Phone Number',
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
    },
    prepare({title, street1, city, state}) {
      return {
        title,
        subtitle: `${street1}, ${city}, ${state}`,
      }
    },
  },
})
