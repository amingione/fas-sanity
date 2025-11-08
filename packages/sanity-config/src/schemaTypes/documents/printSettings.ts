import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'printSettings',
  title: 'Print Settings',
  type: 'document',
  icon: () => '🖨️',
  fields: [
    defineField({
      name: 'title',
      title: 'Settings Name',
      type: 'string',
      initialValue: 'Print & PDF Settings',
      readOnly: true,
    }),

    // Logo Section
    defineField({
      name: 'logo',
      title: 'Company Logo',
      type: 'image',
      description: 'Logo displayed on invoices, quotes, and packing slips',
      options: {
        hotspot: true,
      },
    }),

    // Color Scheme
    defineField({
      name: 'primaryColor',
      title: 'Primary Color',
      type: 'colorValue',
      description: 'Main brand color for headers and accents (hex value)',
      initialValue: {hex: '#000000'},
    }),
    defineField({
      name: 'secondaryColor',
      title: 'Secondary Color',
      type: 'colorValue',
      description: 'Secondary color for borders and highlights (hex value)',
      initialValue: {hex: '#000000'},
    }),
    defineField({
      name: 'textColor',
      title: 'Text Color',
      type: 'colorValue',
      description: 'Main text color (hex value)',
      initialValue: {hex: '#000000'},
    }),

    // Company Info
    defineField({
      name: 'companyName',
      title: 'Company Name',
      type: 'string',
    }),
    defineField({
      name: 'companyAddress',
      title: 'Company Address',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'companyPhone',
      title: 'Phone Number',
      type: 'string',
    }),
    defineField({
      name: 'companyEmail',
      title: 'Email',
      type: 'string',
    }),
    defineField({
      name: 'companyWebsite',
      title: 'Website',
      type: 'url',
    }),

    // Invoice Specific
    defineField({
      name: 'invoiceSettings',
      title: 'Invoice Settings',
      type: 'object',
      options: {collapsible: true, collapsed: false},
      fields: [
        {
          name: 'showLogo',
          title: 'Show Logo on Invoices',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'headerText',
          title: 'Invoice Header Text',
          type: 'string',
          initialValue: 'INVOICE',
        },
        {
          name: 'footerText',
          title: 'Invoice Footer Text',
          type: 'text',
          rows: 2,
          description: 'Text displayed at bottom of invoice',
        },
        {
          name: 'showPaymentTerms',
          title: 'Show Payment Terms',
          type: 'boolean',
          initialValue: true,
        },
      ],
    }),

    // Quote Specific
    defineField({
      name: 'quoteSettings',
      title: 'Quote Settings',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        {
          name: 'showLogo',
          title: 'Show Logo on Quotes',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'headerText',
          title: 'Quote Header Text',
          type: 'string',
          initialValue: 'QUOTE',
        },
        {
          name: 'footerText',
          title: 'Quote Footer Text',
          type: 'text',
          rows: 2,
        },
        {
          name: 'validityPeriod',
          title: 'Default Validity Period (days)',
          type: 'number',
          initialValue: 30,
        },
      ],
    }),

    // Packing Slip Specific
    defineField({
      name: 'packingSlipSettings',
      title: 'Packing Slip Settings',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        {
          name: 'showLogo',
          title: 'Show Logo on Packing Slips',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'headerText',
          title: 'Packing Slip Header Text',
          type: 'string',
          initialValue: 'PACKING SLIP',
        },
        {
          name: 'showPrices',
          title: 'Show Prices on Packing Slip',
          type: 'boolean',
          initialValue: false,
          description: 'Whether to display item prices',
        },
        {
          name: 'includeNotes',
          title: 'Include Special Instructions',
          type: 'boolean',
          initialValue: true,
        },
      ],
    }),

    // Order Specific
    defineField({
      name: 'orderSettings',
      title: 'Order Confirmation Settings',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        {
          name: 'showLogo',
          title: 'Show Logo on Orders',
          type: 'boolean',
          initialValue: true,
        },
        {
          name: 'headerText',
          title: 'Order Header Text',
          type: 'string',
          initialValue: 'ORDER CONFIRMATION',
        },
        {
          name: 'footerText',
          title: 'Order Footer Text',
          type: 'text',
          rows: 2,
        },
      ],
    }),

    // Typography
    defineField({
      name: 'typography',
      title: 'Typography',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        {
          name: 'fontFamily',
          title: 'Font Family',
          type: 'string',
          options: {
            list: [
              {title: 'Helvetica', value: 'Helvetica'},
              {title: 'Arial', value: 'Arial'},
              {title: 'Times New Roman', value: 'Times'},
              {title: 'Courier', value: 'Courier'},
            ],
          },
          initialValue: 'Helvetica',
        },
        {
          name: 'fontSize',
          title: 'Base Font Size',
          type: 'number',
          initialValue: 10,
          validation: (Rule) => Rule.min(8).max(14),
        },
      ],
    }),

    // Layout
    defineField({
      name: 'layout',
      title: 'Layout Options',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        {
          name: 'pageSize',
          title: 'Page Size',
          type: 'string',
          options: {
            list: [
              {title: 'Letter (8.5" × 11")', value: 'letter'},
              {title: 'A4', value: 'a4'},
            ],
          },
          initialValue: 'letter',
        },
        {
          name: 'margins',
          title: 'Page Margins (inches)',
          type: 'object',
          fields: [
            {name: 'top', type: 'number', initialValue: 0.5},
            {name: 'right', type: 'number', initialValue: 0.5},
            {name: 'bottom', type: 'number', initialValue: 0.5},
            {name: 'left', type: 'number', initialValue: 0.5},
          ],
        },
      ],
    }),
  ],

  preview: {
    prepare() {
      return {
        title: 'Print & PDF Settings',
        subtitle: 'Configure appearance of printed documents',
      }
    },
  },
})
