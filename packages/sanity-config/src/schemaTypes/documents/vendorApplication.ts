import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorApplication',
  title: 'Vendor Application',
  type: 'document',
  fields: [
    defineField({
      name: 'applicationNumber',
      title: 'Application Number',
      type: 'string',
    }),
    defineField({
      name: 'companyName',
      title: 'Company Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contactName',
      title: 'Contact Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contactTitle',
      title: 'Contact Title',
      type: 'string',
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'alternatePhone',
      title: 'Alternate Phone',
      type: 'string',
    }),
    defineField({
      name: 'businessType',
      title: 'Business Type',
      type: 'string',
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
    }),
    defineField({
      name: 'taxId',
      title: 'Tax ID',
      type: 'string',
    }),
    defineField({
      name: 'yearsInBusiness',
      title: 'Years in Business',
      type: 'number',
    }),
    defineField({
      name: 'businessAddress',
      title: 'Business Address',
      type: 'object',
      fields: [
        defineField({name: 'street', title: 'Address Line 1', type: 'string'}),
        defineField({name: 'address2', title: 'Address Line 2', type: 'string'}),
        defineField({name: 'city', title: 'City', type: 'string'}),
        defineField({name: 'state', title: 'State', type: 'string'}),
        defineField({name: 'zip', title: 'ZIP Code', type: 'string'}),
        defineField({name: 'country', title: 'Country', type: 'string'}),
      ],
    }),
    defineField({
      name: 'shippingAddressSame',
      title: 'Shipping Address Same as Business',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      fields: [
        defineField({name: 'street', title: 'Address Line 1', type: 'string'}),
        defineField({name: 'address2', title: 'Address Line 2', type: 'string'}),
        defineField({name: 'city', title: 'City', type: 'string'}),
        defineField({name: 'state', title: 'State', type: 'string'}),
        defineField({name: 'zip', title: 'ZIP Code', type: 'string'}),
        defineField({name: 'country', title: 'Country', type: 'string'}),
      ],
      hidden: ({document}) => document?.shippingAddressSame !== false,
    }),
    defineField({
      name: 'taxExempt',
      title: 'Tax Exempt',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'taxExemptCertificate',
      title: 'Tax Exempt Certificate',
      type: 'file',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Submitted', value: 'submitted'},
          {title: 'In Review', value: 'in_review'},
          {title: 'Approved', value: 'approved'},
          {title: 'Rejected', value: 'rejected'},
        ],
      },
      initialValue: 'submitted',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'reviewedAt',
      title: 'Reviewed At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'reviewedBy',
      title: 'Reviewed By',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'vendorRef',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'companyName',
      subtitle: 'status',
      email: 'email',
    },
    prepare(selection) {
      const {title, subtitle, email} = selection as {
        title?: string
        subtitle?: string
        email?: string
      }
      return {
        title: title || 'Vendor Application',
        subtitle: [subtitle, email].filter(Boolean).join(' · '),
      }
    },
  },
})
