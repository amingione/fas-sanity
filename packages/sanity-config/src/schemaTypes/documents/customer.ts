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
    defineField({
      name: 'addresses',
      title: 'Addresses',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'label',
              title: 'Label',
              type: 'string',
            },
            {
              name: 'street1',
              title: 'Street 1',
              type: 'string',
            },
            {
              name: 'street2',
              title: 'Street 2',
              type: 'string',
            },
            {
              name: 'city',
              title: 'City',
              type: 'string',
            },
            {
              name: 'state',
              title: 'State',
              type: 'string',
            },
            {
              name: 'zip',
              title: 'ZIP Code',
              type: 'string',
            },
            {
              name: 'country',
              title: 'Country',
              type: 'string',
            },
            {
              name: 'isDefault',
              title: 'Default Address',
              type: 'boolean',
              initialValue: false,
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'segment',
      title: 'Segment',
      type: 'string',
      options: {
        list: [
          {title: 'VIP', value: 'vip'},
          {title: 'Wholesale', value: 'wholesale'},
          {title: 'Retail', value: 'retail'},
          {title: 'Inactive', value: 'inactive'},
          {title: 'New', value: 'new'},
        ],
      },
    }),
    defineField({
      name: 'lifetimeValue',
      title: 'Lifetime Value',
      type: 'number',
      readOnly: true,
      description: 'Synced from Medusa',
    }),
    defineField({
      name: 'orderCount',
      title: 'Order Count',
      type: 'number',
      readOnly: true,
      description: 'Synced from Medusa',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Internal staff notes',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'email',
    },
  },
})
