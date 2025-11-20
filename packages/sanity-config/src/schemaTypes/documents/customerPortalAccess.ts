import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'customerPortalAccess',
  title: 'Customer Portal Access',
  type: 'document',
  fields: [
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'email',
      title: 'Portal Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      hidden: true,
    }),
    defineField({
      name: 'portalEnabled',
      title: 'Portal Enabled',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'lastLogin',
      title: 'Last Login',
      type: 'datetime',
    }),
    defineField({
      name: 'loginCount',
      title: 'Login Count',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'resetToken',
      title: 'Reset Token',
      type: 'string',
      hidden: true,
    }),
    defineField({
      name: 'resetTokenExpiry',
      title: 'Reset Token Expiry',
      type: 'datetime',
      hidden: true,
    }),
  ],
  preview: {
    select: {
      email: 'email',
      enabled: 'portalEnabled',
      customerName: 'customer.firstName',
      customerLast: 'customer.lastName',
    },
    prepare({email, enabled, customerName, customerLast}) {
      const title = email || 'Portal Access'
      const subtitle = [customerName, customerLast].filter(Boolean).join(' ') || 'Unlinked'
      return {
        title,
        subtitle: `${subtitle} • ${enabled ? 'Enabled' : 'Disabled'}`,
      }
    },
  },
})
