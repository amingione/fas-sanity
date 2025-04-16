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
    }),
    defineField({
      name: 'status',
      title: 'Approval Status',
      type: 'string',
      options: {
        list: ['Pending', 'Approved', 'Rejected'],
        layout: 'radio',
      }
    }),
    defineField({
      name: 'companyName',
      title: 'Company Name',
      type: 'string'
    }),
    defineField({
      name: 'website',
      title: 'Company Website',
      type: 'url'
    }),
    defineField({
      name: 'appliedAt',
      title: 'Date Applied',
      type: 'datetime'
    }),
    defineField({
      name: 'contactPerson',
      title: 'Main Contact Person',
      type: 'string'
    }),
    defineField({
      name: 'partnershipType',
      title: 'Partnership Type',
      type: 'string',
      options: {
        list: ['Reseller', 'Installer', 'Wholesaler', 'Service Center']
      }
    })
  ]
})
