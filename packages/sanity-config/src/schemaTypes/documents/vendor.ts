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
      name: 'portalEnabled',
      title: 'Portal Enabled',
      type: 'boolean',
      description: 'Top-level flag: vendor can log in to the portal when true.',
      initialValue: false,
    }),
    defineField({
      name: 'portalAccess',
      title: 'Portal Access',
      type: 'object',
      fields: [
        defineField({name: 'enabled', title: 'Enabled', type: 'boolean', initialValue: false}),
        defineField({name: 'email', title: 'Portal Email', type: 'string'}),
        defineField({
          name: 'permissions',
          title: 'Permissions',
          type: 'array',
          of: [{type: 'string'}],
          description: 'Granted permission scopes. See backfill-vendor-portal-permissions.ts for valid values.',
          options: {
            list: [
              {title: 'View Own Orders', value: 'view_own_orders'},
              {title: 'Create Wholesale Orders', value: 'create_wholesale_orders'},
              {title: 'View Own Quotes', value: 'view_own_quotes'},
              {title: 'View Wholesale Catalog', value: 'view_wholesale_catalog'},
              {title: 'Send Support Messages', value: 'send_support_messages'},
              {title: 'View Payments', value: 'view_payments'},
              {title: 'View Analytics', value: 'view_analytics'},
              {title: 'Upload Invoices', value: 'upload_invoices'},
            ],
          },
        }),
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
      name: 'shippingAddresses',
      title: 'Shipping Addresses',
      type: 'array',
      description: 'One or more shipping addresses for wholesale order deliveries.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({name: 'label', title: 'Label', type: 'string', description: 'e.g. "Warehouse", "HQ"'}),
            defineField({name: 'isDefault', title: 'Default', type: 'boolean', initialValue: false}),
            defineField({name: 'street', title: 'Address Line 1', type: 'string'}),
            defineField({name: 'address2', title: 'Address Line 2', type: 'string'}),
            defineField({name: 'city', title: 'City', type: 'string'}),
            defineField({name: 'state', title: 'State', type: 'string'}),
            defineField({name: 'zip', title: 'ZIP Code', type: 'string'}),
            defineField({name: 'country', title: 'Country', type: 'string', initialValue: 'US'}),
          ],
          preview: {
            select: {label: 'label', city: 'city', state: 'state', isDefault: 'isDefault'},
            prepare({label, city, state, isDefault}: {label?: string; city?: string; state?: string; isDefault?: boolean}) {
              return {
                title: label || 'Address',
                subtitle: [city, state].filter(Boolean).join(', ') + (isDefault ? ' (default)' : ''),
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'notificationPreferences',
      title: 'Notification Preferences',
      type: 'object',
      description: 'Controls which portal events trigger email notifications to the vendor.',
      fields: [
        defineField({name: 'orderUpdates', title: 'Order Updates', type: 'boolean', initialValue: true}),
        defineField({name: 'quoteActivity', title: 'Quote Activity', type: 'boolean', initialValue: true}),
        defineField({name: 'paymentReminders', title: 'Payment Reminders', type: 'boolean', initialValue: true}),
        defineField({name: 'shipmentTracking', title: 'Shipment Tracking', type: 'boolean', initialValue: true}),
        defineField({name: 'invoiceAlerts', title: 'Invoice Alerts', type: 'boolean', initialValue: true}),
        defineField({name: 'marketingEmails', title: 'Marketing Emails', type: 'boolean', initialValue: false}),
      ],
    }),
    defineField({
      name: 'portalUsers',
      title: 'Portal Users',
      type: 'array',
      of: [
        defineField({
          name: 'portalUser',
          title: 'Portal User',
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
