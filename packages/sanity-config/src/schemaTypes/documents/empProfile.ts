import {defineField, defineType} from 'sanity'
import {UserIcon} from '@sanity/icons'

export default defineType({
  name: 'empProfile',
  title: 'Employee Profile',
  type: 'document',
  icon: UserIcon,
  fields: [
    defineField({
      name: 'firstName',
      title: 'First Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'personalEmail',
      title: 'Personal Email',
      type: 'email',
    }),
    defineField({
      name: 'workEmail',
      title: 'Work Email',
      type: 'email',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'phone',
      title: 'Phone Number',
      type: 'string',
    }),
    defineField({
      name: 'slackUsername',
      title: 'Slack Username',
      type: 'string',
      placeholder: '@username',
    }),
    defineField({
      name: 'status',
      title: 'Employment Status',
      type: 'string',
      options: {
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Inactive', value: 'inactive'},
          {title: 'On Leave', value: 'on_leave'},
          {title: 'Terminated', value: 'terminated'},
        ],
      },
      initialValue: 'active',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      options: {
        list: [
          {title: 'Employee', value: 'employee'},
          {title: 'Manager', value: 'manager'},
          {title: 'Admin', value: 'admin'},
        ],
      },
      initialValue: 'employee',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'department',
      title: 'Department',
      type: 'string',
      options: {
        list: [
          {title: 'Sales', value: 'sales'},
          {title: 'Service', value: 'service'},
          {title: 'Parts', value: 'parts'},
          {title: 'Wholesale', value: 'wholesale'},
          {title: 'Management', value: 'management'},
          {title: 'Other', value: 'other'},
        ],
      },
    }),
    defineField({
      name: 'authUserId',
      title: 'Auth User ID',
      type: 'string',
      description: 'Link to authentication system user ID (from session)',
      readOnly: true,
    }),
    defineField({
      name: 'hireDate',
      title: 'Hire Date',
      type: 'date',
    }),
    defineField({
      name: 'position',
      title: 'Position/Title',
      type: 'string',
    }),
    defineField({
      name: 'smsOptIn',
      title: 'SMS Opt-In',
      type: 'boolean',
      description: 'Employee has opted in to receive SMS notifications',
      initialValue: false,
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      description: 'Private notes - not visible to employees',
      rows: 4,
    }),
    defineField({
      name: 'documents',
      title: 'Documents',
      type: 'array',
      description: 'Upload employee documents (PDF, PNG, JPG, JPEG)',
      of: [
        {
          type: 'object',
          name: 'documentGroup',
          title: 'Document Group',
          fields: [
            {
              name: 'groupName',
              title: 'Group Name',
              type: 'string',
              description: 'Name for this group of documents',
            },
            {
              name: 'uploadDate',
              title: 'Upload Date',
              type: 'datetime',
              initialValue: () => new Date().toISOString(),
            },
            {
              name: 'files',
              title: 'Files',
              type: 'array',
              of: [
                {
                  type: 'file',
                  options: {
                    accept: '.pdf,.png,.jpg,.jpeg',
                  },
                },
              ],
            },
          ],
          preview: {
            select: {
              title: 'groupName',
              fileCount: 'files.length',
              date: 'uploadDate',
            },
            prepare({title, fileCount, date}) {
              return {
                title: title || 'Untitled Group',
                subtitle: `${fileCount || 0} file(s) - ${date ? new Date(date).toLocaleDateString() : ''}`,
              }
            },
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      workEmail: 'workEmail',
    },
    prepare({firstName, lastName, workEmail}) {
      return {
        title: `${firstName || ''} ${lastName || ''}`.trim() || 'Unnamed Employee',
        subtitle: workEmail,
      }
    },
  },
})
