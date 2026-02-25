import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'roles',
      title: 'Roles',
      type: 'array',
      of: [{type: 'string'}],
      initialValue: ['customer'],
    }),
    defineField({
      name: 'customerType',
      title: 'Customer Type',
      type: 'string',
      options: {
        list: [
          {title: 'Retail', value: 'retail'},
          {title: 'Vendor', value: 'vendor'},
          {title: 'Both', value: 'both'},
        ],
      },
      initialValue: 'retail',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'email',
    },
  },
})
