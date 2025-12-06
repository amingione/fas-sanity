import {defineField, defineType} from 'sanity'
import {DocumentIcon} from '@sanity/icons'

export default defineType({
  name: 'createLabel',
  title: 'Create Label',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    defineField({
      name: 'sender',
      title: 'Sender',
      type: 'reference',
      to: [{type: 'senderAddress'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recipientName',
      title: 'Recipient Name',
      type: 'string',
      validation: (Rule) => Rule.required().max(100),
    }),
    defineField({
      name: 'recipientCompany',
      title: 'Recipient Company',
      type: 'string',
      validation: (Rule) => Rule.max(100),
    }),
    defineField({
      name: 'recipientEmail',
      title: 'Recipient Email',
      type: 'string',
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: 'recipientPhone',
      title: 'Recipient Phone',
      type: 'string',
      validation: (Rule) => Rule.max(20),
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
      name: 'parcel',
      title: 'Parcel',
      type: 'object',
      fields: [
        defineField({
          name: 'weight',
          title: 'Weight (lbs)',
          type: 'number',
          validation: (Rule) => Rule.required().min(0.1).max(150),
        }),
        defineField({
          name: 'length',
          title: 'Length (inches)',
          type: 'number',
          validation: (Rule) => Rule.min(0.1).max(108),
        }),
        defineField({
          name: 'width',
          title: 'Width (inches)',
          type: 'number',
          validation: (Rule) => Rule.min(0.1).max(108),
        }),
        defineField({
          name: 'height',
          title: 'Height (inches)',
          type: 'number',
          validation: (Rule) => Rule.min(0.1).max(108),
        }),
      ],
    }),
  ],
})
