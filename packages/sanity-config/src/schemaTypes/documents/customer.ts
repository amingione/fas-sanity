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
      name: 'medusaCustomerId',
      title: 'Medusa Customer ID',
      type: 'string',
      description: 'Set automatically by the Medusa → Sanity sync subscriber. Do not edit manually.',
      readOnly: true,
    }),
    defineField({
      name: 'stripeCustomerId',
      title: 'Stripe Customer ID',
      type: 'string',
      description: 'Stripe customer identifier. Set by checkout flow.',
      readOnly: true,
    }),
    defineField({
      name: 'resendContactId',
      title: 'Resend Contact ID',
      type: 'string',
      description: 'Resend contact identifier. Set by sanity-resend-sync function.',
      readOnly: true,
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
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
