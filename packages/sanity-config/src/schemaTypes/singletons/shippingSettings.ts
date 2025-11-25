import {defineField, defineType} from 'sanity'

type ListOption = {title: string; value: string}

const carrierList: ListOption[] = [
  {title: 'USPS', value: 'USPS'},
  {title: 'UPS', value: 'UPS'},
  {title: 'FedEx', value: 'FedEx'},
  {title: 'DHL', value: 'DHL'},
  {title: 'OnTrac', value: 'OnTrac'},
]

export const shippingSettingsType = defineType({
  name: 'shippingSettings',
  type: 'document',
  title: 'Shipping Settings',
  icon: () => '📦',
  __experimental_actions: ['update', 'publish'],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Settings Title',
      initialValue: 'Shipping Configuration',
      readOnly: true,
    }),
    defineField({
      name: 'easypostApiKey',
      type: 'string',
      title: 'EasyPost API Key',
      description: 'Production API key from EasyPost dashboard',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'easypostTestMode',
      type: 'boolean',
      title: 'Test Mode',
      description: 'Use EasyPost test API (disable for production)',
      initialValue: false,
    }),
    defineField({
      name: 'defaultFromAddress',
      type: 'object',
      title: 'Ship From Address',
      description: 'Your warehouse/store address',
      fields: [
        {name: 'name', type: 'string', title: 'Company Name'},
        {name: 'street1', type: 'string', title: 'Street Address'},
        {name: 'street2', type: 'string', title: 'Suite/Unit'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State'},
        {name: 'zip', type: 'string', title: 'ZIP Code'},
        {name: 'country', type: 'string', title: 'Country', initialValue: 'US'},
        {name: 'phone', type: 'string', title: 'Phone'},
        {name: 'email', type: 'string', title: 'Email'},
      ],
    }),
    defineField({
      name: 'defaultPackaging',
      type: 'array',
      title: 'Standard Package Sizes',
      description: 'Pre-defined box sizes for quick selection',
      of: [
        defineField({
          type: 'object',
          name: 'packageSize',
          fields: [
            {name: 'name', type: 'string', title: 'Package Name'},
            {name: 'length', type: 'number', title: 'Length (in)'},
            {name: 'width', type: 'number', title: 'Width (in)'},
            {name: 'height', type: 'number', title: 'Height (in)'},
            {name: 'weight', type: 'number', title: 'Empty Weight (lbs)'},
          ],
          preview: {
            select: {
              name: 'name',
              length: 'length',
              width: 'width',
              height: 'height',
            },
            prepare({name, length, width, height}) {
              return {
                title: name,
                subtitle: `${length} × ${width} × ${height} inches`,
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'carrierAccounts',
      type: 'array',
      title: 'Carrier Accounts',
      description: 'Connected carrier accounts in EasyPost',
      of: [
        defineField({
          type: 'object',
          fields: [
            {
              name: 'carrier',
              type: 'string',
              title: 'Carrier',
              options: {list: carrierList},
            },
            {
              name: 'accountId',
              type: 'string',
              title: 'EasyPost Carrier Account ID',
            },
            {
              name: 'enabled',
              type: 'boolean',
              title: 'Enabled',
              initialValue: true,
            },
          ],
        }),
      ],
    }),
    defineField({
      name: 'ratePreferences',
      type: 'object',
      title: 'Rate Selection Preferences',
      fields: [
        {
          name: 'preferredCarrier',
          type: 'string',
          title: 'Preferred Carrier',
          options: {
            list: ['USPS', 'UPS', 'FedEx', 'Cheapest', 'Fastest'],
          },
        },
        {
          name: 'excludeCarriers',
          type: 'array',
          title: 'Exclude Carriers',
          of: [{type: 'string'}],
          options: {
            list: carrierList.map((carrier) => carrier.title),
          },
        },
        {
          name: 'maxDeliveryDays',
          type: 'number',
          title: 'Max Delivery Days',
          description: 'Hide rates slower than this',
        },
      ],
    }),
    defineField({
      name: 'labelPreferences',
      type: 'object',
      title: 'Label Preferences',
      fields: [
        {
          name: 'labelFormat',
          type: 'string',
          title: 'Label Format',
          options: {
            list: ['PDF', 'PNG', 'ZPL', 'EPL2'],
          },
          initialValue: 'PDF',
        },
        {
          name: 'labelSize',
          type: 'string',
          title: 'Label Size',
          options: {
            list: ['4x6', '4x8', '8.5x11'],
          },
          initialValue: '4x6',
        },
      ],
    }),
    defineField({
      name: 'automationRules',
      type: 'object',
      title: 'Automation Rules',
      fields: [
        {
          name: 'autoPurchaseLabels',
          type: 'boolean',
          title: 'Auto-Purchase Labels',
          description: 'Automatically buy labels when orders are paid',
          initialValue: false,
        },
        {
          name: 'autoSelectCheapest',
          type: 'boolean',
          title: 'Auto-Select Cheapest Rate',
          description: 'Automatically choose lowest cost option',
          initialValue: false,
        },
        {
          name: 'requireInsuranceOver',
          type: 'number',
          title: 'Require Insurance Over ($)',
          description: 'Automatically add insurance for orders above this amount',
        },
      ],
    }),
    defineField({
      name: 'webhookUrl',
      type: 'url',
      title: 'Webhook URL',
      description: 'Your endpoint for EasyPost tracking webhooks',
      readOnly: true,
    }),
    defineField({
      name: 'webhookSecret',
      type: 'string',
      title: 'Webhook Secret',
      description: 'Secret for verifying webhook signatures',
      readOnly: true,
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Shipping Settings',
      }
    },
  },
})
