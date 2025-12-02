import React from 'react'
import {defineField, defineType} from 'sanity'
import {Badge} from '@sanity/ui'
import {DocumentIcon} from '@sanity/icons'

export default defineType({
  name: 'vendorApplication',
  title: 'Vendor Application',
  type: 'document',
  fields: [
    defineField({
      name: 'applicationNumber',
      type: 'string',
      title: 'Application Number',
      readOnly: true,
      description: 'Auto-generated: APP-XXXXXX',
    }),
    defineField({
      name: 'status',
      type: 'string',
      title: 'Status',
      options: {
        list: [
          {title: 'Pending Review', value: 'pending'},
          {title: 'Approved', value: 'approved'},
          {title: 'Rejected', value: 'rejected'},
          {title: 'On Hold', value: 'on_hold'},
        ],
        layout: 'radio',
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'submittedAt',
      type: 'datetime',
      title: 'Submitted At',
      readOnly: true,
    }),
    defineField({
      name: 'reviewedAt',
      type: 'datetime',
      title: 'Reviewed At',
    }),
    defineField({
      name: 'reviewedBy',
      type: 'string',
      title: 'Reviewed By',
      description: 'Staff member who reviewed this application',
    }),
    defineField({
      name: 'companyName',
      type: 'string',
      title: 'Company Name',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'businessType',
      type: 'string',
      title: 'Business Type',
      options: {
        list: [
          'Retail Shop',
          'Online Store',
          'Distributor',
          'Installer',
          'Performance Shop',
          'Other',
        ],
      },
    }),
    defineField({
      name: 'taxId',
      type: 'string',
      title: 'Tax ID / EIN',
    }),
    defineField({
      name: 'yearsInBusiness',
      type: 'number',
      title: 'Years in Business',
    }),
    defineField({
      name: 'website',
      type: 'url',
      title: 'Website',
    }),
    defineField({
      name: 'contactName',
      type: 'string',
      title: 'Contact Name',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contactTitle',
      type: 'string',
      title: 'Contact Title',
    }),
    defineField({
      name: 'email',
      type: 'string',
      title: 'Email',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'phone',
      type: 'string',
      title: 'Phone',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'alternatePhone',
      type: 'string',
      title: 'Alternate Phone',
    }),
    defineField({
      name: 'businessAddress',
      type: 'object',
      title: 'Business Address',
      fields: [
        {name: 'street', type: 'string', title: 'Street Address'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State'},
        {name: 'zip', type: 'string', title: 'ZIP Code'},
        {name: 'country', type: 'string', title: 'Country', initialValue: 'US'},
      ],
    }),
    defineField({
      name: 'shippingAddressSame',
      type: 'boolean',
      title: 'Shipping address same as business address',
      initialValue: true,
    }),
    defineField({
      name: 'shippingAddress',
      type: 'object',
      title: 'Shipping Address',
      hidden: ({document}) => document?.shippingAddressSame === true,
      fields: [
        {name: 'street', type: 'string', title: 'Street Address'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State'},
        {name: 'zip', type: 'string', title: 'ZIP Code'},
        {name: 'country', type: 'string', title: 'Country', initialValue: 'US'},
      ],
    }),
    defineField({
      name: 'estimatedMonthlyVolume',
      type: 'string',
      title: 'Estimated Monthly Volume',
      options: {
        list: [
          '$1,000 - $5,000',
          '$5,000 - $10,000',
          '$10,000 - $25,000',
          '$25,000 - $50,000',
          '$50,000+',
        ],
      },
    }),
    defineField({
      name: 'productsInterested',
      type: 'array',
      title: 'Products Interested In',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
    }),
    defineField({
      name: 'currentSuppliers',
      type: 'text',
      title: 'Current Suppliers',
      rows: 3,
    }),
    defineField({
      name: 'howDidYouHear',
      type: 'string',
      title: 'How did you hear about us?',
    }),
    defineField({
      name: 'taxExempt',
      type: 'boolean',
      title: 'Tax Exempt',
      initialValue: false,
    }),
    defineField({
      name: 'taxExemptCertificate',
      type: 'file',
      title: 'Tax Exemption Certificate',
      hidden: ({document}) => !document?.taxExempt,
      options: {
        accept: '.pdf,.jpg,.jpeg,.png',
      },
    }),
    defineField({
      name: 'references',
      type: 'array',
      title: 'Business References',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'companyName', type: 'string', title: 'Company Name'},
            {name: 'contactName', type: 'string', title: 'Contact Name'},
            {name: 'phone', type: 'string', title: 'Phone'},
            {name: 'email', type: 'string', title: 'Email'},
          ],
        },
      ],
    }),
    defineField({
      name: 'additionalNotes',
      type: 'text',
      title: 'Additional Information',
      rows: 4,
    }),
    defineField({
      name: 'internalNotes',
      type: 'text',
      title: 'Internal Notes',
      description: 'Staff notes - not visible to applicant',
      rows: 4,
    }),
    defineField({
      name: 'vendorRef',
      type: 'reference',
      title: 'Vendor Account',
      to: [{type: 'vendor'}],
      readOnly: true,
      description: 'Created when application is approved',
    }),
  ],
  preview: {
    select: {
      title: 'companyName',
      subtitle: 'email',
      status: 'status',
      submittedAt: 'submittedAt',
    },
    prepare({title, subtitle, status, submittedAt}) {
      const date = submittedAt ? new Date(submittedAt) : null
      const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : null
      const subline = [subtitle, dateLabel].filter(Boolean).join(' • ')

      const label = (() => {
        switch (status) {
          case 'approved':
            return 'Approved'
          case 'rejected':
            return 'Rejected'
          case 'on_hold':
            return 'On hold'
          default:
            return 'Pending review'
        }
      })()

      const tone: 'positive' | 'critical' | 'caution' | 'default' =
        status === 'approved'
          ? 'positive'
          : status === 'rejected'
            ? 'critical'
            : status === 'on_hold'
              ? 'default'
              : 'caution'

      return {
        title: title || 'Vendor Application',
        subtitle: subline || undefined,
        media: () => React.createElement(Badge, {tone, mode: 'outline'}, label),
        icon: DocumentIcon,
      }
    },
  },
  __experimental_omnisearch_visibility: true,
})
