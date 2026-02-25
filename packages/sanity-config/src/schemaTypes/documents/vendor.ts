import {defineField, defineType} from 'sanity'

const STATUS_OPTIONS = [
  {title: 'Active', value: 'active'},
  {title: 'Inactive', value: 'inactive'},
  {title: 'Pending Approval', value: 'pending'},
  {title: 'Suspended', value: 'suspended'},
  {title: 'On Hold', value: 'on_hold'},
]

const PRICING_TIER_OPTIONS = [
  {title: 'Standard', value: 'standard'},
  {title: 'Preferred', value: 'preferred'},
  {title: 'Platinum', value: 'platinum'},
  {title: 'Custom', value: 'custom'},
]

const PAYMENT_TERMS = [
  {title: 'Due on Receipt', value: 'due_on_receipt'},
  {title: 'Net 15', value: 'net_15'},
  {title: 'Net 30', value: 'net_30'},
  {title: 'Net 60', value: 'net_60'},
  {title: 'Net 90', value: 'net_90'},
]

const addressFields = [
  defineField({name: 'street', title: 'Address Line 1', type: 'string'}),
  defineField({name: 'address2', title: 'Address Line 2', type: 'string'}),
  defineField({name: 'city', title: 'City', type: 'string'}),
  defineField({name: 'state', title: 'State', type: 'string'}),
  defineField({name: 'zip', title: 'ZIP Code', type: 'string'}),
  defineField({name: 'country', title: 'Country', type: 'string'}),
]

export default defineType({
  name: 'vendor',
  title: 'Vendor',
  type: 'document',
  fields: [
    defineField({
      name: 'vendorNumber',
      title: 'Vendor Number',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'companyName',
      title: 'Company Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'displayName',
      title: 'Display Name',
      type: 'string',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: STATUS_OPTIONS},
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
    }),
    defineField({
      name: 'businessType',
      title: 'Business Type',
      type: 'string',
    }),
    defineField({
      name: 'yearsInBusiness',
      title: 'Years in Business',
      type: 'number',
    }),
    defineField({
      name: 'primaryContact',
      title: 'Primary Contact',
      type: 'object',
      fields: [
        defineField({name: 'name', title: 'Name', type: 'string'}),
        defineField({name: 'title', title: 'Title', type: 'string'}),
        defineField({name: 'email', title: 'Email', type: 'string'}),
        defineField({name: 'phone', title: 'Phone', type: 'string'}),
        defineField({name: 'mobile', title: 'Mobile', type: 'string'}),
      ],
    }),
    defineField({
      name: 'businessAddress',
      title: 'Business Address',
      type: 'object',
      fields: addressFields,
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      fields: addressFields,
    }),
    defineField({
      name: 'pricingTier',
      title: 'Pricing Tier',
      type: 'string',
      options: {list: PRICING_TIER_OPTIONS},
      initialValue: 'standard',
    }),
    defineField({
      name: 'customDiscountPercentage',
      title: 'Custom Discount %',
      type: 'number',
      hidden: ({document}) => document?.pricingTier !== 'custom',
    }),
    defineField({
      name: 'paymentTerms',
      title: 'Payment Terms',
      type: 'string',
      options: {list: PAYMENT_TERMS},
      initialValue: 'net_30',
    }),
    defineField({
      name: 'creditLimit',
      title: 'Credit Limit',
      type: 'number',
    }),
    defineField({
      name: 'currentBalance',
      title: 'Current Balance',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'minimumOrderAmount',
      title: 'Minimum Order Amount',
      type: 'number',
      initialValue: 500,
    }),
    defineField({
      name: 'allowBackorders',
      title: 'Allow Backorders',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'autoApproveOrders',
      title: 'Auto-Approve Orders',
      type: 'boolean',
      initialValue: false,
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
      name: 'taxId',
      title: 'Tax ID',
      type: 'string',
    }),
    defineField({
      name: 'portalAccess',
      title: 'Portal Access',
      type: 'object',
      fields: [
        defineField({name: 'enabled', title: 'Enabled', type: 'boolean', initialValue: false}),
        defineField({name: 'email', title: 'Portal Email', type: 'string'}),
        defineField({name: 'invitedAt', title: 'Invited At', type: 'datetime'}),
        defineField({name: 'lastLogin', title: 'Last Login', type: 'datetime', readOnly: true}),
        defineField({name: 'userSub', title: 'Portal User Sub', type: 'string', hidden: true}),
        defineField({
          name: 'passwordHash',
          title: 'Portal Password Hash',
          type: 'string',
          hidden: true,
          readOnly: true,
        }),
      ],
    }),
    defineField({
      name: 'portalUsers',
      title: 'Portal Users',
      type: 'array',
      of: [
        defineField({
          type: 'object',
          fields: [
            defineField({name: 'email', title: 'Email', type: 'string'}),
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({name: 'role', title: 'Role', type: 'string'}),
            defineField({name: 'active', title: 'Active', type: 'boolean', initialValue: true}),
          ],
        }),
      ],
    }),
    defineField({
      name: 'accountManager',
      title: 'Account Manager',
      type: 'string',
    }),
    defineField({
      name: 'onboardedAt',
      title: 'Onboarded At',
      type: 'datetime',
    }),
    defineField({
      name: 'totalOrders',
      title: 'Total Orders',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'totalRevenue',
      title: 'Total Revenue',
      type: 'number',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'customerRef',
      title: 'Linked Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      readOnly: true,
    }),
    defineField({
      name: 'applicationRef',
      title: 'Linked Application',
      type: 'reference',
      to: [{type: 'vendorApplication'}],
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'companyName',
      status: 'status',
      vendorNumber: 'vendorNumber',
    },
    prepare(selection) {
      const {title, status, vendorNumber} = selection as {
        title?: string
        status?: string
        vendorNumber?: string
      }
      const prefix = vendorNumber ? `${vendorNumber} · ` : ''
      return {
        title: title || 'Vendor',
        subtitle: `${prefix}${status || 'Status'}`,
      }
    },
  },
})
