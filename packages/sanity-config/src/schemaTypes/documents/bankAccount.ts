import {defineType, defineField} from 'sanity'

export const bankAccountType = defineType({
  name: 'bankAccount',
  title: 'Bank Account',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Display Name',
      type: 'string',
      description: 'Friendly label shown in the Studio when selecting an account.',
    }),
    defineField({
      name: 'institutionName',
      title: 'Institution',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'holderName',
      title: 'Account Holder Name',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'stripeAccountId',
      title: 'Stripe Financial Connections Account ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'accountLast4',
      title: 'Account Last 4',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'routingLast4',
      title: 'Routing Last 4',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Pending', value: 'pending'},
          {title: 'Disconnected', value: 'disconnected'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'defaultForChecks',
      title: 'Default for Check Printing',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        defineField({name: 'lastSyncedAt', title: 'Last Synced', type: 'datetime', readOnly: true}),
        defineField({
          name: 'linkSessionId',
          title: 'Stripe Session ID',
          type: 'string',
          readOnly: true,
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      institution: 'institutionName',
      last4: 'accountLast4',
      status: 'status',
    },
    prepare({title, institution, last4, status}) {
      const display = title || institution || 'Bank Account'
      const suffix = last4 ? `••••${last4}` : ''
      return {
        title: display,
        subtitle: [institution, suffix, status ? status.toUpperCase() : null]
          .filter(Boolean)
          .join(' • '),
      }
    },
  },
})
