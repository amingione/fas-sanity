import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'vendor',
  title: 'Vendor',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Vendor Name',
      type: 'string'
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string'
    }),
    defineField({
      name: 'phone',
      title: 'Phone Number',
      type: 'string'
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'text'
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text'
    })
  ]
})
