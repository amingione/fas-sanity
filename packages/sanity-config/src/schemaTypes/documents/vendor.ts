import {defineField, defineType} from 'sanity'
import ReferenceCodeInput from '../../components/inputs/ReferenceCodeInput'
import {generateInitialVendorNumber} from '../../utils/generateVendorNumber'

const API_VERSION = '2024-10-01'

const STATUS_OPTIONS = [
  {title: 'Active', value: 'active'},
  {title: 'Inactive', value: 'inactive'},
  {title: 'Pending Approval', value: 'pending'},
  {title: 'Suspended', value: 'suspended'},
  {title: 'On Hold', value: 'on_hold'},
]

const BUSINESS_TYPES = [
  {title: 'Manufacturer', value: 'manufacturer'},
  {title: 'Distributor', value: 'distributor'},
  {title: 'Wholesaler', value: 'wholesaler'},
  {title: 'Supplier', value: 'supplier'},
  {title: 'Drop Shipper', value: 'drop_shipper'},
]

const PAYMENT_TERMS = [
  {title: 'Due on Receipt', value: 'due_on_receipt'},
  {title: 'Net 15', value: 'net_15'},
  {title: 'Net 30', value: 'net_30'},
  {title: 'Net 60', value: 'net_60'},
  {title: 'Net 90', value: 'net_90'},
  {title: 'COD', value: 'cod'},
  {title: 'Prepaid', value: 'prepaid'},
]

const PORTAL_PERMISSIONS = [
  {title: 'View Purchase Orders', value: 'view_purchase_orders'},
  {title: 'Update Product Inventory', value: 'update_inventory'},
  {title: 'Upload Invoices', value: 'upload_invoices'},
  {title: 'View Payments', value: 'view_payments'},
  {title: 'Manage Products', value: 'manage_products'},
  {title: 'View Analytics', value: 'view_analytics'},
]

export default defineType({
  name: 'vendor',
  title: 'Vendor',
  type: 'document',
  groups: [
    {name: 'basic', title: 'Basic Info', default: true},
    {name: 'contact', title: 'Contact Info'},
    {name: 'business', title: 'Business Details'},
    {name: 'portal', title: 'Portal Access'},
    {name: 'settings', title: 'Settings'},
  ],
  orderings: [
    {
      title: 'Vendor Number',
      name: 'vendorNumberAsc',
      by: [{field: 'vendorNumber', direction: 'asc'}],
    },
    {
      title: 'Company Name',
      name: 'companyNameAsc',
      by: [{field: 'companyName', direction: 'asc'}],
    },
    {
      title: 'Status',
      name: 'statusAsc',
      by: [
        {field: 'status', direction: 'asc'},
        {field: 'companyName', direction: 'asc'},
      ],
    },
    {
      title: 'Recently Updated',
      name: 'recentlyUpdatedDesc',
      by: [
        {field: '_updatedAt', direction: 'desc'},
        {field: 'companyName', direction: 'asc'},
      ],
    },
  ],
  fields: [
    defineField({
      name: 'vendorNumber',
      title: 'Vendor Number',
      type: 'string',
      description: 'Unique vendor identifier (e.g., VEN-001)',
      validation: (Rule) => Rule.required(),
      readOnly: true,
      group: 'basic',
      components: {input: ReferenceCodeInput},
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: API_VERSION})
        return generateInitialVendorNumber(client)
      },
    }),
    defineField({
      name: 'companyName',
      title: 'Company Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'displayName',
      title: 'Display Name',
      type: 'string',
      description: 'Name shown on website (if different from company name)',
      group: 'basic',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'companyName',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: {hotspot: true},
      group: 'basic',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
      description: 'Public-facing description of the vendor',
      group: 'basic',
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
      group: 'basic',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: STATUS_OPTIONS,
        layout: 'radio',
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'businessType',
      title: 'Business Type',
      type: 'string',
      options: {list: BUSINESS_TYPES},
      group: 'basic',
    }),
    defineField({
      name: 'featured',
      title: 'Featured Vendor',
      type: 'boolean',
      description: 'Show on homepage or featured section',
      initialValue: false,
      group: 'basic',
    }),
    defineField({
      name: 'primaryContact',
      title: 'Primary Contact',
      type: 'object',
      group: 'contact',
      options: {columns: 2},
      fields: [
        defineField({
          name: 'name',
          title: 'Name',
          type: 'string',
          validation: (Rule) => Rule.required(),
        }),
        defineField({name: 'title', title: 'Title', type: 'string'}),
        defineField({
          name: 'email',
          title: 'Email',
          type: 'string',
          validation: (Rule) => Rule.required().email(),
        }),
        defineField({name: 'phone', title: 'Phone', type: 'string'}),
        defineField({name: 'mobile', title: 'Mobile', type: 'string'}),
      ],
    }),
    defineField({
      name: 'accountingContact',
      title: 'Accounting Contact',
      type: 'object',
      group: 'contact',
      options: {columns: 2},
      fields: [
        defineField({name: 'name', title: 'Name', type: 'string'}),
        defineField({
          name: 'email',
          title: 'Email',
          type: 'string',
          validation: (Rule) => Rule.email(),
        }),
        defineField({name: 'phone', title: 'Phone', type: 'string'}),
      ],
    }),
    defineField({
      name: 'businessAddress',
      title: 'Business Address',
      type: 'object',
      group: 'contact',
      options: {columns: 2},
      fields: [
        defineField({name: 'street', title: 'Address Line 1', type: 'string'}),
        defineField({name: 'address2', title: 'Address Line 2', type: 'string'}),
        defineField({name: 'city', title: 'City', type: 'string'}),
        defineField({name: 'state', title: 'State', type: 'string'}),
        defineField({name: 'zip', title: 'ZIP Code', type: 'string'}),
        defineField({name: 'country', title: 'Country', type: 'string', initialValue: 'USA'}),
      ],
    }),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'object',
      group: 'contact',
      options: {columns: 2},
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
      name: 'shippingAddresses',
      title: 'Shipping Addresses',
      type: 'array',
      group: 'contact',
      of: [
        defineField({
          name: 'shippingAddress',
          type: 'object',
          fields: [
            defineField({
              name: 'label',
              title: 'Address Label',
              type: 'string',
              description: 'e.g., Main Warehouse, Secondary Location',
            }),
            defineField({name: 'street', type: 'string', title: 'Street Address'}),
            defineField({name: 'address2', type: 'string', title: 'Address Line 2'}),
            defineField({name: 'city', type: 'string', title: 'City'}),
            defineField({name: 'state', type: 'string', title: 'State'}),
            defineField({name: 'zip', type: 'string', title: 'ZIP Code'}),
            defineField({
              name: 'country',
              type: 'string',
              title: 'Country',
              initialValue: 'USA',
            }),
            defineField({
              name: 'isDefault',
              title: 'Default Address',
              type: 'boolean',
              initialValue: false,
            }),
          ],
          preview: {
            select: {
              label: 'label',
              street: 'street',
              city: 'city',
              state: 'state',
            },
            prepare({label, street, city, state}) {
              const streetLine = street ? `${street}` : 'Address'
              const cityLine = [city, state].filter(Boolean).join(', ')
              return {
                title: label || 'Address',
                subtitle: cityLine ? `${streetLine}, ${cityLine}` : streetLine,
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'paymentTerms',
      title: 'Payment Terms',
      type: 'string',
      options: {list: PAYMENT_TERMS},
      initialValue: 'net_30',
      group: 'business',
    }),
    defineField({
      name: 'pricingTier',
      title: 'Pricing Tier',
      type: 'string',
      group: 'business',
      options: {
        list: [
          {title: 'Standard (10% off retail)', value: 'standard'},
          {title: 'Preferred (12% off retail)', value: 'preferred'},
          {title: 'Platinum (15% off retail)', value: 'platinum'},
          {title: 'Custom Pricing', value: 'custom'},
        ],
      },
      initialValue: 'standard',
    }),
    defineField({
      name: 'customDiscountPercentage',
      title: 'Custom Discount %',
      type: 'number',
      group: 'business',
      hidden: ({document}) => document?.pricingTier !== 'custom',
      validation: (Rule) => Rule.min(0).max(100),
    }),
    defineField({
      name: 'creditLimit',
      title: 'Credit Limit ($)',
      type: 'number',
      group: 'business',
    }),
    defineField({
      name: 'currentBalance',
      title: 'Current Balance ($)',
      type: 'number',
      readOnly: true,
      group: 'business',
      initialValue: 0,
    }),
    defineField({
      name: 'taxExempt',
      title: 'Tax Exempt?',
      type: 'boolean',
      initialValue: false,
      group: 'business',
    }),
    defineField({
      name: 'taxExemptCertificate',
      title: 'Tax Exempt Certificate',
      type: 'file',
      group: 'business',
      hidden: ({document}) => !document?.taxExempt,
    }),
    defineField({
      name: 'taxId',
      title: 'Tax ID / EIN',
      type: 'string',
      description: 'For internal use only',
      group: 'business',
    }),
    defineField({
      name: 'yearsInBusiness',
      title: 'Years in Business',
      type: 'number',
      group: 'business',
    }),
    defineField({
      name: 'certifications',
      title: 'Certifications',
      type: 'array',
      of: [{type: 'string'}],
      description: 'ISO, quality certifications, etc.',
      group: 'business',
    }),
    defineField({
      name: 'minimumOrderAmount',
      title: 'Minimum Order ($)',
      type: 'number',
      group: 'business',
      initialValue: 500,
    }),
    defineField({
      name: 'allowBackorders',
      title: 'Allow Backorders',
      type: 'boolean',
      initialValue: true,
      group: 'business',
    }),
    defineField({
      name: 'autoApproveOrders',
      title: 'Auto-approve Orders Under Credit Limit',
      type: 'boolean',
      description: 'Auto-approve orders under credit limit',
      initialValue: false,
      group: 'business',
    }),
    defineField({
      name: 'portalEnabled',
      title: 'Portal Access Enabled',
      type: 'boolean',
      description: 'Allow vendor to access vendor portal',
      initialValue: false,
      group: 'portal',
    }),
    defineField({
      name: 'portalUsers',
      title: 'Portal Users',
      type: 'array',
      group: 'portal',
      of: [
        defineField({
          type: 'object',
          name: 'portalUser',
          fields: [
            defineField({name: 'email', title: 'Email', type: 'string'}),
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({
              name: 'role',
              title: 'Role',
              type: 'string',
              options: {list: ['Admin', 'Ordering', 'View Only']},
            }),
            defineField({name: 'active', title: 'Active', type: 'boolean', initialValue: true}),
          ],
        }),
      ],
    }),
    defineField({
      name: 'portalAccess',
      title: 'Portal Access',
      type: 'object',
      group: 'portal',
      fields: [
        defineField({
          name: 'enabled',
          title: 'Portal Access Enabled',
          type: 'boolean',
          description: 'Allow vendor to access vendor portal',
          initialValue: false,
        }),
        defineField({
          name: 'email',
          title: 'Portal Login Email',
          type: 'string',
          validation: (Rule) => Rule.email(),
          readOnly: true,
        }),
        defineField({
          name: 'userSub',
          title: 'Portal User Sub',
          type: 'string',
          readOnly: true,
          hidden: true,
          validation: (Rule) =>
            Rule.custom(async (value, context) => {
              if (!value) return true
              const docId = context?.document?._id
              const client = context.getClient({apiVersion: API_VERSION})
              const matches = await client.fetch<number>(
                'count(*[_type == "vendor" && portalAccess.userSub == $sub && _id != $id])',
                {sub: value, id: docId},
              )
              return matches > 0 ? 'Portal userSub must be unique per vendor.' : true
            }),
        }),
        defineField({
          name: 'passwordHash',
          title: 'Password Hash',
          type: 'string',
          hidden: true,
          readOnly: true,
        }),
        defineField({
          name: 'lastLogin',
          title: 'Last Login',
          type: 'datetime',
          readOnly: true,
        }),
        defineField({
          name: 'setupToken',
          title: 'Setup Token',
          type: 'string',
          hidden: true,
          description: 'One-time token for account setup',
        }),
        defineField({
          name: 'setupTokenExpiry',
          title: 'Setup Token Expiry',
          type: 'datetime',
          hidden: true,
          description: 'When the setup token expires (24 hours)',
        }),
        defineField({
          name: 'permissions',
          title: 'Permissions',
          type: 'array',
          of: [{type: 'string'}],
          options: {list: PORTAL_PERMISSIONS},
        }),
        defineField({
          name: 'invitedAt',
          title: 'Invited At',
          type: 'datetime',
          readOnly: true,
        }),
        defineField({
          name: 'invitedBy',
          title: 'Invited By',
          type: 'reference',
          to: [{type: 'user'}],
          readOnly: true,
        }),
      ],
    }),
    defineField({
      name: 'notificationPreferences',
      title: 'Notification Preferences',
      type: 'object',
      group: 'portal',
      fields: [
        defineField({
          name: 'emailOrders',
          title: 'Email: Order Updates',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'emailInvoices',
          title: 'Email: Invoice Updates',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'emailMessages',
          title: 'Email: New Messages',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'emailPayments',
          title: 'Email: Payment Updates',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'browserNotifications',
          title: 'Browser Notifications',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'smsNotifications',
          title: 'SMS Notifications',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'smsPhone',
          title: 'SMS Phone Number',
          type: 'string',
          description: 'Phone number for SMS notifications',
        }),
      ],
    }),
    defineField({
      name: 'savedPaymentMethods',
      title: 'Saved Payment Methods',
      type: 'array',
      group: 'portal',
      of: [
        defineField({
          name: 'paymentMethod',
          type: 'object',
          fields: [
            defineField({
              name: 'type',
              title: 'Type',
              type: 'string',
              options: {
                list: [
                  {title: 'Credit Card', value: 'card'},
                  {title: 'Bank Account', value: 'bank'},
                ],
              },
            }),
            defineField({
              name: 'last4',
              title: 'Last 4 Digits',
              type: 'string',
            }),
            defineField({
              name: 'brand',
              title: 'Brand',
              type: 'string',
              description: 'e.g., Visa, Mastercard, Amex',
            }),
            defineField({
              name: 'expiryMonth',
              title: 'Expiry Month',
              type: 'number',
            }),
            defineField({
              name: 'expiryYear',
              title: 'Expiry Year',
              type: 'number',
            }),
            defineField({
              name: 'isDefault',
              title: 'Default Payment Method',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'stripePaymentMethodId',
              title: 'Stripe Payment Method ID',
              type: 'string',
              description: 'Stripe payment method ID for processing',
            }),
          ],
          preview: {
            select: {
              type: 'type',
              brand: 'brand',
              last4: 'last4',
            },
            prepare({type, brand, last4}) {
              const label = brand || type || 'Payment Method'
              const ending = last4 ? ` ending in ${last4}` : ''
              const subtitle = type === 'card' ? 'Credit Card' : 'Bank Account'
              return {
                title: `${label}${ending}`,
                subtitle,
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash (legacy)',
      type: 'string',
      hidden: true,
      readOnly: true,
      group: 'portal',
    }),
    defineField({
      name: 'roles',
      title: 'Access Roles',
      type: 'array',
      of: [{type: 'string'}],
      initialValue: ['vendor'],
      options: {
        list: [
          {title: 'Vendor', value: 'vendor'},
          {title: 'Customer', value: 'customer'},
          {title: 'Admin', value: 'admin'},
        ],
      },
      group: 'portal',
    }),
    defineField({
      name: 'lastLogin',
      title: 'Last Login Date',
      type: 'datetime',
      readOnly: true,
      group: 'portal',
    }),
    defineField({
      name: 'accountManager',
      title: 'Account Manager',
      description: 'Staff member managing this account',
      type: 'string',
      group: 'settings',
    }),
    defineField({
      name: 'onboardedAt',
      title: 'Onboarded At',
      type: 'datetime',
      group: 'settings',
    }),
    defineField({
      name: 'lastOrderDate',
      title: 'Last Order Date',
      type: 'datetime',
      readOnly: true,
      group: 'settings',
    }),
    defineField({
      name: 'totalOrders',
      title: 'Total Orders',
      type: 'number',
      readOnly: true,
      initialValue: 0,
      group: 'settings',
    }),
    defineField({
      name: 'totalRevenue',
      title: 'Total Revenue',
      type: 'number',
      readOnly: true,
      initialValue: 0,
      group: 'settings',
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 4,
      description: 'Private notes (not shown publicly or to vendor)',
      group: 'settings',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
      group: 'settings',
    }),
    defineField({
      name: 'socialMedia',
      title: 'Social Media',
      type: 'object',
      group: 'settings',
      fields: [
        defineField({name: 'facebook', title: 'Facebook', type: 'url'}),
        defineField({name: 'instagram', title: 'Instagram', type: 'url'}),
        defineField({name: 'twitter', title: 'Twitter', type: 'url'}),
        defineField({name: 'linkedin', title: 'LinkedIn', type: 'url'}),
      ],
    }),
    defineField({
      name: 'rating',
      title: 'Vendor Rating',
      type: 'number',
      description: 'Internal rating (1-5)',
      validation: (Rule) => Rule.min(1).max(5),
      group: 'settings',
    }),
    defineField({
      name: 'preferredVendor',
      title: 'Preferred Vendor',
      type: 'boolean',
      description: 'Mark as preferred vendor for priority ordering',
      initialValue: false,
      group: 'settings',
    }),
    defineField({
      name: 'customerRef',
      title: 'Linked Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      description: 'Associate this vendor with the matching customer account',
      readOnly: true,
      validation: (Rule) =>
        Rule.required().custom(async (value, context) => {
          if (!value?._ref) return true
          const client = context.getClient({apiVersion: API_VERSION})
          const customer = await client.fetch<{roles?: string[]; email?: string} | null>(
            `*[_type == "customer" && _id == $id][0]{roles, email}`,
            {id: value._ref},
          )
          if (!customer) return 'Linked customer not found.'
          if (!customer.email) return 'Linked customer must have an email.'
          if (!customer.roles?.includes('vendor')) {
            return 'Linked customer must include the vendor role.'
          }
          return true
        }),
      group: 'settings',
    }),
    defineField({
      name: 'applicationRef',
      title: 'Linked Application',
      type: 'reference',
      to: [{type: 'vendorApplication'}],
      readOnly: true,
      group: 'settings',
    }),
    defineField({
      name: 'orders',
      title: 'Orders',
      type: 'array',
      of: [{type: 'vendorOrderSummary'}],
      readOnly: true,
      group: 'settings',
    }),
    defineField({
      name: 'quotes',
      title: 'Submitted Quotes',
      type: 'array',
      of: [{type: 'vendorQuoteSummary'}],
      readOnly: true,
      group: 'settings',
    }),
    defineField({
      name: 'assignedCustomers',
      title: 'Assigned Customers',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'customer'}]}],
      group: 'settings',
    }),
    defineField({
      name: 'active',
      title: 'Active Status',
      type: 'boolean',
      initialValue: true,
      group: 'settings',
    }),
  ],
  preview: {
    select: {
      title: 'companyName',
      subtitle: 'businessType',
      media: 'logo',
      status: 'status',
      vendorNumber: 'vendorNumber',
    },
    prepare(selection) {
      const {title, subtitle, media, status, vendorNumber} = selection
      const statusLabel = status || 'Status'
      const typeLabel = subtitle || 'Vendor'
      const vendorPrefix = vendorNumber ? `${vendorNumber} • ` : ''
      return {
        title,
        subtitle: `${vendorPrefix}${statusLabel} • ${typeLabel}`,
        media,
      }
    },
  },
})
