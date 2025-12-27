import {defineType, defineField} from 'sanity'
import CustomerDiscountsInput from '../../components/inputs/CustomerDiscountsInput'
import ComputedCustomerNameInput from '../../components/inputs/ComputedCustomerNameInput'

const CUSTOMER_GROUPS = [
  {name: 'profile', title: 'Profile', default: true},
  {name: 'addresses', title: 'Addresses'},
  {name: 'activity', title: 'Activity'},
  {name: 'marketing', title: 'Marketing'},
  {name: 'stripe', title: 'Stripe'},
  {name: 'discounts', title: 'Discounts'},
]

export default defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  groups: CUSTOMER_GROUPS,
  fieldsets: [
    {
      name: 'shippingInfo',
      title: 'Shipping Address',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'billingInfo',
      title: 'Billing Address',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: [
    // Identity
    defineField({
      name: 'userId',
      title: 'External User ID',
      type: 'string',
      description:
        'Legacy identifier for imported accounts. FAS Auth uses this document ID, so new users can leave this empty.',
      group: 'profile',
      hidden: true,
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      readOnly: true,
      description: 'Auto-generated from first + last name and falls back to email.',
      components: {input: ComputedCustomerNameInput as any},
      validation: (Rule) =>
        Rule.required().error('Name is required and is computed from first/last name or email.'),
      group: 'profile',
      hidden: true,
    }),
    defineField({name: 'firstName', title: 'First Name', type: 'string', group: 'profile'}),
    defineField({name: 'lastName', title: 'Last Name', type: 'string', group: 'profile'}),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
      group: 'profile',
    }),
    defineField({
      name: 'stripeCustomerId',
      title: 'Stripe Customer ID',
      type: 'string',
      readOnly: true,
      group: 'stripe',
      hidden: true,
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
      group: 'stripe',
    }),
    defineField({
      name: 'roles',
      title: 'Roles',
      type: 'array',
      of: [{type: 'string'}],
      initialValue: ['customer'],
      options: {
        list: [
          {title: 'Customer', value: 'customer'},
          {title: 'Guest (no account)', value: 'guest'},
          {title: 'Vendor', value: 'vendor'},
          {title: 'Admin', value: 'admin'},
        ],
      },
      validation: (Rule) =>
        Rule.required()
          .min(1)
          .warning('Users should have at least one role')
          .custom(async (value, context) => {
            const roles = Array.isArray(value) ? value : []
            const hasVendorRole = roles.includes('vendor')
            const documentId = context?.document?._id || ''
            const customerId = documentId.replace(/^drafts\./, '')
            if (!customerId) return true
            const client = context.getClient({apiVersion: '2024-10-01'})
            const vendorCount = await client.fetch<number>(
              'count(*[_type == "vendor" && customerRef._ref == $id])',
              {id: customerId},
            )
            if (vendorCount > 0 && !hasVendorRole) {
              return 'Cannot remove vendor role while a vendor is linked to this customer.'
            }
            return true
          }),
      description:
        'Used by FAS Auth to gate access to portals. Guests are imported from Stripe and do not have login access.',
      group: 'profile',
    }),
    defineField({
      name: 'customerType',
      title: 'Customer Type',
      type: 'string',
      options: {
        list: [
          {title: 'Retail (online only)', value: 'retail'},
          {title: 'In-store service', value: 'in-store'},
          {title: 'Vendor / Wholesale', value: 'vendor'},
          {title: 'Both retail & in-store', value: 'both'},
        ],
      },
      initialValue: 'retail',
      group: 'profile',
    }),
    defineField({
      name: 'hasVisitedStore',
      title: 'Has visited store',
      type: 'boolean',
      initialValue: false,
      group: 'profile',
    }),
    defineField({
      name: 'preferredContactMethod',
      title: 'Preferred Contact Method',
      type: 'string',
      options: {
        list: [
          {title: 'Email', value: 'email'},
          {title: 'Phone', value: 'phone'},
          {title: 'Text message', value: 'text'},
        ],
        layout: 'radio',
      },
      group: 'profile',
    }),
    defineField({
      name: 'communicationPreferences',
      title: 'Communication Preferences',
      type: 'object',
      group: 'profile',
      options: {collapsible: true, collapsed: true},
      fields: [
        defineField({
          name: 'preferredMethod',
          title: 'Preferred Method',
          type: 'string',
          options: {
            list: [
              {title: 'Email', value: 'email'},
              {title: 'Phone', value: 'phone'},
              {title: 'Text', value: 'text'},
              {title: 'No Contact', value: 'none'},
            ],
          },
        }),
        defineField({
          name: 'marketingOptIn',
          title: 'Marketing Opt-In',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'smsOptIn',
          title: 'SMS Opt-In',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'appointmentReminders',
          title: 'Appointment Reminders',
          type: 'boolean',
          initialValue: true,
        }),
      ],
    }),
    defineField({
      name: 'passwordHash',
      title: 'Password Hash',
      type: 'string',
      hidden: true,
      group: 'profile',
    }),
    defineField({name: 'phone', title: 'Phone Number', type: 'string', group: 'profile'}),
    defineField({
      name: 'shippingAddress',
      title: 'Shipping Address',
      type: 'customerBillingAddress',
      fieldset: 'shippingInfo',
      group: 'addresses',
    }),
    defineField({
      name: 'address',
      title: 'Shipping Address (legacy)',
      type: 'text',
      fieldset: 'shippingInfo',
      hidden: true,
      group: 'addresses',
    }),
    defineField({
      name: 'billingAddress',
      title: 'Billing Address',
      type: 'customerBillingAddress',
      fieldset: 'billingInfo',
      group: 'addresses',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
      group: 'profile',
    }),
    defineField({
      name: 'orders',
      title: 'Orders',
      type: 'array',
      of: [{type: 'customerOrderSummary'}],
      group: 'activity',
    }),
    defineField({
      name: 'quotes',
      title: 'Saved Quotes',
      type: 'array',
      of: [{type: 'customerQuoteSummary'}],
      group: 'activity',
    }),
    defineField({
      name: 'addresses',
      title: 'Addresses',
      type: 'array',
      of: [{type: 'customerAddress'}],
      group: 'addresses',
    }),
    defineField({
      name: 'wishlistItems',
      title: 'Wishlist Items',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      group: 'activity',
      hidden: true,
    }),
    defineField({
      name: 'vehicles',
      title: 'Vehicles',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'vehicle'}]}],
      group: 'activity',
    }),
    defineField({
      name: 'preferredServices',
      title: 'Preferred Services',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'service'}]}],
      group: 'activity',
    }),
    defineField({
      name: 'customerNotes',
      title: 'Customer Notes',
      type: 'text',
      rows: 4,
      description: 'Internal notes about this customer',
      group: 'activity',
    }),
    defineField({
      name: 'referredBy',
      title: 'Referred By',
      type: 'reference',
      to: [{type: 'customer'}],
      group: 'activity',
    }),
    defineField({
      name: 'referralCount',
      title: 'Referral Count',
      type: 'number',
      initialValue: 0,
      readOnly: true,
      group: 'activity',
      hidden: true,
    }),
    defineField({
      name: 'stripeMetadata',
      title: 'Latest Stripe Metadata',
      type: 'array',
      of: [{type: 'stripeMetadataEntry'}],
      readOnly: true,
      group: 'stripe',
      hidden: true,
    }),
    // Marketing preferences
    defineField({
      name: 'emailOptIn',
      title: 'Email Opt‑In',
      type: 'boolean',
      initialValue: false,
      group: 'marketing',
    }),
    defineField({
      name: 'marketingOptIn',
      title: 'Marketing Opt‑In',
      type: 'boolean',
      initialValue: false,
      group: 'marketing',
    }),
    defineField({
      name: 'textOptIn',
      title: 'Text/SMS Opt‑In',
      type: 'boolean',
      initialValue: false,
      group: 'marketing',
    }),
    defineField({
      name: 'emailMarketing',
      title: 'Email Marketing',
      type: 'object',
      group: 'marketing',
      options: {
        collapsible: true,
        collapsed: false,
      },
      fields: [
        defineField({
          name: 'subscribed',
          title: 'Subscribed to Marketing Emails',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'subscribedAt',
          title: 'Subscribed At',
          type: 'datetime',
          readOnly: true,
        }),
        defineField({
          name: 'unsubscribedAt',
          title: 'Unsubscribed At',
          type: 'datetime',
          readOnly: true,
        }),
        defineField({
          name: 'source',
          title: 'Subscription Source',
          type: 'string',
          options: {
            list: [
              {title: 'Checkout', value: 'checkout'},
              {title: 'Newsletter Signup', value: 'newsletter'},
              {title: 'Manual', value: 'manual'},
              {title: 'Backfill', value: 'backfill'},
            ],
          },
        }),
        defineField({
          name: 'preferences',
          title: 'Email Preferences',
          type: 'object',
          description: 'Granular email preferences (future use)',
          fields: [
            defineField({
              name: 'newProducts',
              type: 'boolean',
              title: 'New Products',
              initialValue: true,
            }),
            defineField({
              name: 'promotions',
              type: 'boolean',
              title: 'Promotions & Sales',
              initialValue: true,
            }),
            defineField({
              name: 'tips',
              type: 'boolean',
              title: 'Performance Tips',
              initialValue: true,
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'segment',
      title: 'Customer Segment',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          {title: '💎 VIP (>$10k lifetime)', value: 'vip'},
          {title: '🔁 Repeat (3+ orders)', value: 'repeat'},
          {title: '🆕 New (<30 days)', value: 'new'},
          {title: '⚠️ At Risk (6+ months idle)', value: 'at_risk'},
          {title: '😴 Inactive (12+ months idle)', value: 'inactive'},
          {title: '✅ Active', value: 'active'},
        ],
      },
      group: 'activity',
    }),
    defineField({
      name: 'lifetimeValue',
      title: 'Lifetime Value',
      type: 'number',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'totalOrders',
      title: 'Total Orders',
      type: 'number',
      readOnly: true,
      initialValue: 0,
      group: 'activity',
    }),
    defineField({
      name: 'averageOrderValue',
      title: 'Average Order Value',
      type: 'number',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'lastOrderDate',
      title: 'Last Order Date',
      type: 'datetime',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'firstOrderDate',
      title: 'First Order Date',
      type: 'datetime',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'daysSinceLastOrder',
      title: 'Days Since Last Order',
      type: 'number',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'orderCount',
      title: 'Order Count',
      type: 'number',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'quoteCount',
      title: 'Quote Count',
      type: 'number',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'lifetimeSpend',
      title: 'Lifetime Spend ($)',
      type: 'number',
      readOnly: true,
      group: 'activity',
    }),
    defineField({
      name: 'discounts',
      title: 'Stripe Discounts',
      type: 'array',
      of: [{type: 'customerDiscount'}],
      readOnly: false,
      group: 'discounts',
      components: {input: CustomerDiscountsInput as any},
      description: 'Synced customer-level coupons and promotions from Stripe.',
    }),
    defineField({
      name: 'shippingQuotes',
      title: 'Shipping Quotes',
      type: 'array',
      group: 'activity',
      description: 'Saved shipping quote PDFs and supporting notes.',
      of: [
        {
          type: 'file',
          title: 'Quote Document',
          options: {accept: '.pdf,.png,.jpg,.jpeg,.heic'},
          fields: [
            defineField({
              name: 'createdAt',
              title: 'Created',
              type: 'datetime',
              initialValue: () => new Date().toISOString(),
              readOnly: true,
            }),
            defineField({name: 'carrier', title: 'Carrier', type: 'string'}),
            defineField({name: 'service', title: 'Service', type: 'string'}),
            defineField({name: 'rate', title: 'Rate', type: 'string'}),
            defineField({name: 'notes', title: 'Notes', type: 'text', rows: 2}),
          ],
        },
      ],
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
      group: 'profile',
      hidden: true,
    }),
  ],

  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      orderCount: 'orderCount',
      lifetimeSpend: 'lifetimeSpend',
      city: 'shippingAddress.city',
      state: 'shippingAddress.state',
      emailOptIn: 'emailOptIn',
      marketingOptIn: 'marketingOptIn',
      segment: 'segment',
    },
    prepare({
      firstName,
      lastName,
      email,
      orderCount,
      lifetimeSpend,
      city,
      state,
      emailOptIn,
      marketingOptIn,
      segment,
    }) {
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
      const displayName = fullName || email || 'Unnamed Customer'
      const location = [city, state].filter(Boolean).join(', ')
      const orders = typeof orderCount === 'number' ? orderCount : 0
      const lifetimeTotal =
        typeof lifetimeSpend === 'number' && Number.isFinite(lifetimeSpend)
          ? lifetimeSpend
          : lifetimeSpend
      const spend =
        typeof lifetimeTotal === 'number'
          ? new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }).format(lifetimeTotal)
          : '$0'
      const subscribed = emailOptIn || marketingOptIn ? '✓' : ''

      const parts = [
        orders > 0 ? `${orders} orders` : 'No orders',
        spend,
        location,
        subscribed ? 'Subscribed' : '',
      ].filter(Boolean)

      return {
        title: displayName,
        subtitle: parts.length ? [email, ...parts].filter(Boolean).join(' • ') : email || undefined,
        description: email || undefined,
      }
    },
  },
})
