import {UserIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'user',
  title: 'User',
  type: 'document',
  icon: UserIcon,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'email',
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      description: 'Job title or team',
    }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'avatar',
      title: 'Avatar',
      type: 'image',
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative text',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      description: 'Encrypted password (never shown in plain text)',
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Inactive', value: 'inactive'},
          {title: 'Suspended', value: 'suspended'},
          {title: 'Pending', value: 'pending'},
        ],
        layout: 'radio',
      },
      initialValue: 'active',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'lastLogin',
      title: 'Last Login',
      type: 'datetime',
      description: 'Last time user logged into dashboard',
      readOnly: true,
    }),
    defineField({
      name: 'permissions',
      title: 'Permissions',
      type: 'array',
      of: [{type: 'string'}],
      options: {
        list: [
          {title: 'Manage Products', value: 'products.manage'},
          {title: 'Manage Orders', value: 'orders.manage'},
          {title: 'Manage Customers', value: 'customers.manage'},
          {title: 'Manage Shipping', value: 'shipping.manage'},
          {title: 'Manage Blog', value: 'blog.manage'},
          {title: 'Manage Vendors', value: 'vendors.manage'},
          {title: 'View Analytics', value: 'analytics.view'},
          {title: 'Manage Settings', value: 'settings.manage'},
          {title: 'Manage Users', value: 'users.manage'},
        ],
      },
    }),
    defineField({
      name: 'department',
      title: 'Department',
      type: 'string',
      options: {
        list: [
          {title: 'Sales', value: 'sales'},
          {title: 'Warehouse', value: 'warehouse'},
          {title: 'Customer Support', value: 'support'},
          {title: 'Management', value: 'management'},
          {title: 'Marketing', value: 'marketing'},
        ],
      },
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
    }),
    defineField({
      name: 'employeeId',
      title: 'Employee ID',
      type: 'string',
      description: 'Internal employee identifier',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'email',
      media: 'avatar',
      role: 'role',
      status: 'status',
    },
    prepare(selection) {
      const {title, media, role, status} = selection
      return {
        title: title,
        subtitle: `${role || 'User'} • ${status || 'active'}`,
        media: media,
      }
    },
  },
})
