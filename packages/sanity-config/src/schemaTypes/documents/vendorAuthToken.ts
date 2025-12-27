import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorAuthToken',
  title: 'Vendor Auth Token',
  type: 'document',
  hidden: true,
  fields: [
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      readOnly: true,
    }),
    defineField({
      name: 'tokenHash',
      title: 'Token Hash',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tokenType',
      title: 'Token Type',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          {title: 'Invitation', value: 'invitation'},
          {title: 'Password Reset', value: 'password-reset'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expiresAt',
      title: 'Expires At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'usedAt',
      title: 'Used At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      readOnly: true,
    }),
  ],
})
