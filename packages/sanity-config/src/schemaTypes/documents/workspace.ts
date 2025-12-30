import {defineField, defineType} from 'sanity'
import {UsersIcon} from '@sanity/icons'

export default defineType({
  name: 'workspace',
  title: 'Workspace',
  type: 'document',
  icon: UsersIcon,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 64},
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Suspended', value: 'suspended'},
          {title: 'Archived', value: 'archived'},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      initialValue: 'active',
    }),
    defineField({
      name: 'billingEmail',
      title: 'Billing Email',
      type: 'email',
    }),
    defineField({
      name: 'plan',
      title: 'Plan',
      type: 'string',
      options: {
        list: [
          {title: 'Starter', value: 'starter'},
          {title: 'Professional', value: 'professional'},
          {title: 'Enterprise', value: 'enterprise'},
        ],
      },
      initialValue: 'starter',
    }),
    defineField({
      name: 'members',
      title: 'Members',
      type: 'array',
      of: [
        defineField({
          name: 'owner',
          type: 'object',
          fields: [
            {name: 'email', type: 'email', title: 'Email', validation: (Rule) => Rule.required()},
            {name: 'name', type: 'string', title: 'Name'},
            {
              name: 'role',
              title: 'Role',
              type: 'string',
              options: {
                list: [
                  {title: 'Owner', value: 'owner'},
                  {title: 'Admin', value: 'admin'},
                  {title: 'Editor', value: 'editor'},
                  {title: 'Viewer', value: 'viewer'},
                ],
              },
              initialValue: 'viewer',
              validation: (Rule) => Rule.required(),
            },
            {name: 'invitedAt', title: 'Invited At', type: 'datetime'},
            {name: 'joinedAt', title: 'Joined At', type: 'datetime'},
          ],
        }),
      ],
    }),
    defineField({
      name: 'usage',
      title: 'Usage',
      type: 'object',
      fields: [
        {name: 'webhooksMonth', title: 'Webhooks (month)', type: 'number'},
        {name: 'webhooksTotal', title: 'Webhooks (total)', type: 'number'},
        {name: 'costThisPeriod', title: 'Cost (this period)', type: 'number'},
      ],
    }),
    defineField({
      name: 'settings',
      title: 'Settings',
      type: 'object',
      fields: [
        {name: 'dataRegion', title: 'Data Region', type: 'string'},
        {name: 'ssoProvider', title: 'SSO Provider', type: 'string'},
        {name: 'auditLogging', title: 'Audit Logging Enabled', type: 'boolean'},
      ],
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'array',
      of: [{type: 'text'}],
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'plan',
    },
    prepare({title, subtitle}) {
      return {
        title,
        subtitle: subtitle ? `Plan: ${subtitle}` : undefined,
      }
    },
  },
})
