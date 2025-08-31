import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'vendor',
  title: 'Vendor',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Vendor Name',
      type: 'string',
      validation: Rule => Rule.required()
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: Rule => Rule.required().email()
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      hidden: true,
      readOnly: true
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
      initialValue: 'Pending',
      options: {
        list: ['Pending', 'Approved', 'Rejected'],
        layout: 'radio'
      },
      validation: Rule => Rule.required()
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
    // Business verification fields
    defineField({
      name: 'resaleCertificateId',
      title: 'Resale Certificate ID',
      type: 'string',
      validation: Rule => Rule.required()
    }),
    defineField({
      name: 'taxId',
      title: 'Tax ID (EIN)',
      type: 'string',
      validation: Rule => Rule.required()
    }),
    defineField({
      name: 'businessAddress',
      title: 'Business Address',
      type: 'string',
      validation: Rule => Rule.required()
    }),
    defineField({
      name: 'businessType',
      title: 'Business Type',
      type: 'string',
      options: {
        list: ['LLC', 'Corporation', 'Sole Proprietor', 'Partnership', 'Other']
      }
    }),
    defineField({
      name: 'yearsInBusiness',
      title: 'Years in Business',
      type: 'number'
    }),
    defineField({
      name: 'licenseDocument',
      title: 'Business License Upload',
      type: 'file'
    }),
    defineField({
      name: 'userRole',
      title: 'User Role',
      type: 'string',
      initialValue: 'vendor',
      hidden: true,
      readOnly: true
    }),
    defineField({
      name: 'approved',
      title: 'Approved Vendor',
      type: 'boolean',
      initialValue: false
    }),
    defineField({
      name: 'partnershipType',
      title: 'Partnership Type',
      type: 'string',
      options: {
        list: ['Reseller', 'Installer', 'Wholesaler', 'Service Center']
      }
    }),
    defineField({
      name: 'logo',
      title: 'Company Logo',
      type: 'image',
      options: {
        hotspot: true
      }
    }),
    defineField({ name: 'orders', title: 'Orders', type: 'array', of: [ { type: 'vendorOrderSummary' } ] }),
    defineField({ name: 'quotes', title: 'Submitted Quotes', type: 'array', of: [ { type: 'vendorQuoteSummary' } ] }),
    defineField({
      name: 'assignedCustomers',
      title: 'Assigned Customers',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'customer' }] }]
    }),
    defineField({
      name: 'lastLogin',
      title: 'Last Login Date',
      type: 'datetime'
    }),
    defineField({
      name: 'active',
      title: 'Active Status',
      type: 'boolean',
      initialValue: true
    })
  ]
})
