import {defineType, defineField} from 'sanity'
import {googleProductCategories} from '../constants/googleProductCategories'
import AutoSKUInput from '../../components/AutoSKUInput'
import {generateFasSKU, syncSKUToStripe} from '../../utils/generateSKU'

const PRODUCT_PLACEHOLDER_ASSET = 'image-c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000-png'

/**
 * SIMPLIFIED PRODUCT SCHEMA
 *
 * Groups reorganized by priority:
 * 1. Essentials - Must-have fields to create a product
 * 2. Content - Description and product info
 * 3. Pricing - Price, sales, Stripe integration
 * 4. Media - Images and videos
 * 5. Options - Product variants and add-ons
 * 6. Compatibility - Vehicle fitment
 * 7. SEO - Search engine optimization
 * 8. Advanced - Less commonly used fields
 */

const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  groups: [
    {name: 'essentials', title: '✓ Essentials', default: true},
    {name: 'content', title: 'Content & Description'},
    {name: 'key features', title: 'Key Features'},
    {name: 'pricing', title: 'Pricing & Sale'},
    {name: 'media', title: 'Images & Media'},
    {name: 'options', title: 'Options & Add-ons'},
    {name: 'compatibility', title: 'Vehicle Compatibility'},
    {name: 'shipping', title: 'Shipping & Logistics'},
    {name: 'seo', title: 'SEO & Metadata'},
    {name: 'advanced', title: 'Advanced Settings'},
  ],
  fieldsets: [
    {
      name: 'stripe',
      title: 'Stripe Integration (Auto-synced - Read Only)',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'shipping',
      title: 'Shipping Configuration (Required)',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'merchant',
      title: 'Google Merchant Center (Required)',
      options: {collapsible: true, collapsed: false},
    },
  ],
  fields: [
    // ============================================
    // ESSENTIALS - Required to create a product
    // ============================================
    defineField({
      name: 'title',
      title: 'Product Title',
      type: 'string',
      description: 'The name of your product as it appears on the website',
      validation: (Rule) => Rule.required(),
      group: 'essentials',
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      description: 'Auto-generated from title. Used in product URL',
      validation: (Rule) => Rule.required(),
      group: 'essentials',
    }),
    defineField({
      name: 'images',
      title: 'Product Images',
      type: 'array',
      of: [
        {
          type: 'image',
          fields: [
            {
              name: 'alt',
              title: 'Alt Text',
              type: 'string',
              description: 'Describe the image for accessibility & SEO',
            },
          ],
          options: {hotspot: true},
        },
      ],
      description: 'Main product gallery images',
      group: 'essentials',
      validation: (Rule) =>
        Rule.min(1).warning('Add at least one photo so the product looks good on the storefront.'),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description: 'Controls product visibility',
      options: {
        layout: 'radio',
        list: [
          {title: 'Active - Live on website', value: 'active'},
          {title: 'Draft - Not published yet', value: 'draft'},
          {title: 'Paused - Temporarily hidden', value: 'paused'},
          {title: 'Archived - No longer available', value: 'archived'},
        ],
      },
      initialValue: 'active',
      group: 'essentials',
    }),
    defineField({
      name: 'category',
      title: 'Categories',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'category'}]}],
      description: 'Organize products into categories for shop filtering',
      group: 'essentials',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Freeform keywords to help internal search, merchandising, or quick filters.',
      group: 'essentials',
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string',
      description: 'Auto-generated and Stripe-synced SKU using the FAS format.',
      readOnly: true,
      group: 'essentials',
      components: {input: AutoSKUInput},
      initialValue: async ({document, getClient}) => {
        try {
          const client = getClient?.({apiVersion: '2024-10-01'})
          if (!client) return ''
          const sku = await generateFasSKU(document?.title, (document as any)?.platform, client)
          if (document?.stripeProductId) {
            await syncSKUToStripe(sku, document.stripeProductId)
          }
          return sku
        } catch (error) {
          console.warn('Failed to set initial SKU:', error)
          return ''
        }
      },
    }),
    defineField({
      name: 'featured',
      title: 'Featured Product',
      type: 'boolean',
      description: 'Show this product in featured sections',
      initialValue: false,
      group: 'essentials',
    }),
    defineField({
      name: 'promotionTagline',
      title: 'Promotion Tagline',
      type: 'string',
      description: 'Marketing tagline or highlight for product cards.',
      group: 'content',
    }),

    // ============================================
    // PRICING - Price and sale configuration
    // ============================================
    defineField({
      name: 'price',
      title: 'Regular Price (USD)',
      type: 'number',
      description: 'Base product price',
      validation: (Rule) => Rule.min(0),
      group: 'pricing',
    }),
    defineField({
      name: 'onSale',
      title: 'On Sale?',
      type: 'boolean',
      description: 'Enable to show sale pricing',
      initialValue: false,
      group: 'pricing',
    }),
    defineField({
      name: 'salePrice',
      title: 'Sale Price (USD)',
      type: 'number',
      description: 'Discounted price when on sale',
      validation: (Rule) => Rule.min(0),
      hidden: ({parent}) => !parent?.onSale,
      group: 'pricing',
    }),

    // Stripe Integration (Auto-managed, collapsible)
    defineField({
      name: 'stripeProductId',
      title: 'Stripe Product ID',
      type: 'string',
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripeDefaultPriceId',
      title: 'Stripe Default Price ID',
      type: 'string',
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripePriceId',
      title: 'Stripe Primary Price ID',
      type: 'string',
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripeActive',
      title: 'Stripe Active Status',
      type: 'boolean',
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripeUpdatedAt',
      title: 'Stripe Updated At',
      type: 'datetime',
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Last Synced with Stripe',
      type: 'datetime',
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripePrices',
      title: 'Stripe Price History',
      type: 'array',
      of: [{type: 'stripePriceSnapshot'}],
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),
    defineField({
      name: 'stripeMetadata',
      title: 'Stripe Metadata',
      type: 'array',
      of: [{type: 'stripeMetadataEntry'}],
      readOnly: true,
      fieldset: 'stripe',
      group: 'pricing',
    }),

    // ============================================
    // CONTENT - Product descriptions
    // ============================================
    defineField({
      name: 'shortDescription',
      title: 'Short Description',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [{title: 'Normal', value: 'normal'}],
          lists: [{title: 'Bullet', value: 'bullet'}],
          marks: {
            decorators: [
              {title: 'Bold', value: 'strong'},
              {title: 'Italic', value: 'em'},
            ],
          },
        },
      ],
      description: 'Brief intro shown near title/price (1-2 sentences)',
      validation: (Rule) => Rule.max(2).warning('Keep it concise'),
      group: 'content',
    }),
    defineField({
      name: 'description',
      title: 'Full Description',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
          ],
          lists: [
            {title: 'Bullet', value: 'bullet'},
            {title: 'Numbered', value: 'number'},
          ],
          marks: {
            decorators: [
              {title: 'Bold', value: 'strong'},
              {title: 'Italic', value: 'em'},
              {title: 'Underline', value: 'underline'},
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [{name: 'href', type: 'url', title: 'URL'}],
              },
            ],
          },
        },
        {type: 'image', options: {hotspot: true}},
      ],
      description: 'Full product description with formatting',
      group: 'content',
    }),
    defineField({
      name: 'keyFeatures',
      title: 'Key Features',
      type: 'array',
      of: [{type: 'collapsibleFeature'}],
      description: 'Highlight main selling points with icons',
      group: 'key features',
    }),
    defineField({
      name: 'importantNotes',
      title: 'Important Notes / Warnings',
      type: 'array',
      of: [{type: 'block'}],
      description: 'Critical info displayed prominently (e.g., fitment requirements, warnings)',
      group: 'content',
    }),
    defineField({
      name: 'specifications',
      title: 'Technical Specifications',
      type: 'array',
      description: 'Key/value specs shown in table (Material, Weight, Dimensions, etc.)',
      of: [{type: 'specItem'}],
      group: 'content',
    }),
    defineField({
      name: 'attributes',
      title: 'Product Attributes',
      type: 'array',
      of: [{type: 'attribute'}],
      description: 'Additional attributes (Color: Black, Finish: Anodized, etc.)',
      group: 'content',
    }),
    defineField({
      name: 'includedInKit',
      title: "What's Included",
      type: 'array',
      of: [{type: 'kitItem'}],
      description: 'List items included in the kit (bolts, gaskets, instructions)',
      group: 'content',
    }),

    defineField({
      name: 'mediaAssets',
      title: 'Additional Media',
      type: 'array',
      of: [{type: 'mediaItem'}],
      description: 'Videos, PDFs, installation guides, etc.',
      group: 'media',
    }),

    // ============================================
    // OPTIONS - Product variants and add-ons
    // ============================================
    defineField({
      name: 'productType',
      title: 'Product Type',
      type: 'string',
      description: 'Simple = single product, Variable = has options (color/size)',
      initialValue: 'simple',
      options: {
        list: [
          {title: 'Simple Product', value: 'simple'},
          {title: 'Variable Product (has options)', value: 'variable'},
        ],
        layout: 'radio',
      },
      group: 'options',
    }),
    defineField({
      name: 'options',
      title: 'Product Options',
      description:
        'Color, Size, or custom selectors customers must choose before adding to cart. Use the Required toggle on each option to enforce selection.',
      type: 'array',
      of: [
        {type: 'customProductOption.color'},
        {type: 'customProductOption.size'},
        {type: 'customProductOption.custom'},
      ],
      hidden: ({parent}) => parent?.productType !== 'variable',
      validation: (Rule) =>
        Rule.custom((options, context) => {
          const productType = (context?.parent as {productType?: string} | undefined)?.productType
          if (productType !== 'variable') return true
          if (!Array.isArray(options) || options.length === 0) {
            return 'Variable products need at least one option set'
          }
          return true
        }),
      group: 'options',
    }),
    defineField({
      name: 'customPaint',
      title: 'Custom Paint Options',
      type: 'customPaint',
      description: 'Enable custom paint color selection',
      group: 'options',
    }),
    defineField({
      name: 'addOns',
      title: 'Upgrades & Add-ons (Optional)',
      type: 'array',
      of: [{type: 'addOn'}],
      description:
        'Upsell extras the customer may choose in addition to required product options (e.g., ceramic bearings, install kits).',
      group: 'options',
    }),
    defineField({
      name: 'customizations',
      title: 'Customizations & Personalization',
      type: 'array',
      of: [{type: 'productCustomization'}],
      description:
        'Collect engraving text, initials, or other personalization details. Mark fields as required to block checkout until completed.',
      group: 'options',
    }),

    // ============================================
    // COMPATIBILITY - Vehicle fitment
    // ============================================
    defineField({
      name: 'compatibleVehicles',
      title: 'Compatible Vehicles',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'vehicleModel'}]}],
      description: 'Link to compatible vehicle models',
      group: 'compatibility',
    }),
    defineField({
      name: 'tune',
      title: 'Associated Tune',
      type: 'reference',
      to: [{type: 'tune'}],
      description: 'Link to tune if applicable',
      group: 'compatibility',
    }),
    defineField({
      name: 'averageHorsepower',
      title: 'Average Horsepower Gain',
      type: 'number',
      description: 'Expected HP increase',
      group: 'compatibility',
    }),

    // ============================================
    // SEO - Search engine optimization
    // ============================================
    defineField({
      name: 'metaTitle',
      title: 'Meta Title',
      type: 'string',
      description: 'SEO title (50-60 chars recommended)',
      validation: (Rule) => Rule.max(60).warning('Keep under 60 characters'),
      group: 'seo',
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Description',
      type: 'text',
      rows: 3,
      description: 'SEO description (140-160 chars recommended)',
      validation: (Rule) => Rule.max(160).warning('Keep under 160 characters'),
      group: 'seo',
    }),
    defineField({
      name: 'brand',
      title: 'Brand / Manufacturer',
      type: 'string',
      description: 'Brand name for schema.org markup',
      group: 'seo',
    }),
    defineField({
      name: 'gtin',
      title: 'GTIN (UPC/EAN)',
      type: 'string',
      description: 'Product barcode for Google Shopping',
      group: 'seo',
    }),
    defineField({
      name: 'mpn',
      title: 'MPN',
      type: 'string',
      description: 'Manufacturer Part Number',
      group: 'seo',
    }),
    defineField({
      name: 'socialImage',
      title: 'Social Share Image',
      type: 'image',
      options: {hotspot: true},
      fields: [{name: 'alt', title: 'Alt Text', type: 'string'}],
      description: 'Custom image for social media sharing (1200×630px)',
      group: 'seo',
    }),
    defineField({
      name: 'canonicalUrl',
      title: 'Canonical URL',
      type: 'url',
      description:
        'Auto-filled from the product slug; override only when a custom canonical is required.',
      initialValue: ({document}: {document?: any}) => {
        const slug = document?.slug?.current
        return slug ? `https://fasmotorsports.com/shop/${slug}` : ''
      },
      group: 'seo',
    }),
    defineField({
      name: 'noindex',
      title: 'Hide from Search Engines',
      type: 'boolean',
      initialValue: false,
      description: 'Prevent search engines from indexing',
      group: 'seo',
    }),

    // ============================================
    // ADVANCED - Less frequently used fields
    // ============================================

    // Related Products
    defineField({
      name: 'relatedProducts',
      title: 'Related Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description: 'Manually curated related products (auto-computed by default)',
      group: 'advanced',
    }),
    defineField({
      name: 'upsellProducts',
      title: 'Upsell Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description: 'Premium alternatives to suggest',
      group: 'advanced',
    }),

    // Product Tags
    defineField({
      name: 'filters',
      title: 'Filter Tags',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'filterTag'}]}],
      description: 'Tags for shop filtering',
      group: 'advanced',
    }),

    // Shipping Configuration (Required)
    defineField({
      name: 'shippingWeight',
      title: 'Weight (lbs)',
      type: 'number',
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'boxDimensions',
      title: 'Box Size',
      type: 'string',
      description: 'Format: 18x12x10 inches',
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'handlingTime',
      title: 'Handling Time (Days)',
      type: 'number',
      description: 'Business days needed to prepare and hand off the shipment.',
      validation: (Rule) => Rule.min(0),
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'installOnly',
      title: 'Install Only (No Shipping)',
      type: 'boolean',
      description: 'In-store installation only',
      initialValue: false,
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'coreRequired',
      title: 'Core Required',
      type: 'boolean',
      description: 'Indicates if the product requires a customer core return or exchange.',
      initialValue: false,
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'shippingClass',
      title: 'Shipping Class',
      type: 'string',
      options: {
        list: ['Standard', 'Oversized', 'Freight', 'Free Shipping', 'Install Only'],
      },
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'shipsAlone',
      title: 'Ships Separately',
      type: 'boolean',
      description: 'Cannot ship with other items',
      fieldset: 'shipping',
      group: 'shipping',
    }),
    defineField({
      name: 'specialShippingNotes',
      title: 'Special Shipping Notes',
      type: 'text',
      rows: 4,
      description: 'Internal or customer-facing shipping notes that must accompany orders.',
      fieldset: 'shipping',
      group: 'shipping',
    }),

    // Google Merchant Center Requirements
    defineField({
      name: 'availability',
      title: 'Availability Status',
      type: 'string',
      options: {
        list: [
          {title: 'In stock', value: 'in_stock'},
          {title: 'Out of stock', value: 'out_of_stock'},
          {title: 'Preorder', value: 'preorder'},
          {title: 'Backorder', value: 'backorder'},
        ],
      },
      initialValue: 'in_stock',
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'condition',
      title: 'Product Condition',
      type: 'string',
      options: {
        list: [
          {title: 'New', value: 'new'},
          {title: 'Refurbished', value: 'refurbished'},
          {title: 'Used', value: 'used'},
        ],
      },
      initialValue: 'new',
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'manualInventoryCount',
      title: 'Inventory Count',
      type: 'number',
      validation: (Rule) => Rule.min(0),
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'googleProductCategory',
      title: 'Google Shopping Category',
      type: 'string',
      options: {
        list: googleProductCategories.map((category) => ({title: category, value: category})),
      },
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'taxBehavior',
      title: 'Tax Treatment',
      type: 'string',
      options: {
        list: [
          {title: 'Taxable', value: 'taxable'},
          {title: 'Tax Exempt', value: 'exempt'},
        ],
      },
      initialValue: 'taxable',
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'pricingTiers',
      title: 'Bulk Pricing Tiers',
      type: 'array',
      of: [{type: 'pricingTier'}],
      fieldset: 'merchant',
      group: 'advanced',
    }),

    defineField({
      name: 'merchantData',
      title: 'Merchant Data',
      type: 'object',
      fields: [
        defineField({
          name: 'linkedMerchant',
          title: 'Merchant Feed',
          type: 'reference',
          to: [{type: 'merchantFeed'}],
        }),
        defineField({
          name: 'linkedCampaign',
          title: 'Campaign Data',
          type: 'reference',
          to: [{type: 'shoppingCampaign'}],
        }),
      ],
      options: {collapsible: true},
      group: 'advanced',
    }),

    // Deprecated fields (hidden unless they have values)
    defineField({
      name: 'variationOptions',
      title: 'Variation Options (deprecated)',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
      hidden: ({parent}) =>
        !Array.isArray(parent?.variationOptions) || parent.variationOptions.length === 0,
      group: 'advanced',
    }),
    defineField({
      name: 'color',
      title: 'Color (legacy)',
      type: 'string',
      hidden: ({parent}) => !parent?.color,
      readOnly: true,
      group: 'advanced',
    }),
    defineField({
      name: 'size',
      title: 'Size (legacy)',
      type: 'string',
      hidden: ({parent}) => !parent?.size,
      readOnly: true,
      group: 'advanced',
    }),
    defineField({
      name: 'material',
      title: 'Material (legacy)',
      type: 'string',
      hidden: ({parent}) => !parent?.material,
      readOnly: true,
      group: 'advanced',
    }),
  ],

  preview: {
    select: {
      title: 'title',
      subtitle: 'sku',
      firstImageAsset: 'images.0.asset',
      price: 'price',
      status: 'status',
    },
    prepare({title, subtitle, firstImageAsset, price, status}) {
      const priceDisplay =
        typeof price === 'number'
          ? new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(price)
          : 'No price'

      const media = firstImageAsset
        ? {_type: 'image', asset: firstImageAsset}
        : {_type: 'image', asset: {_ref: PRODUCT_PLACEHOLDER_ASSET}}

      return {
        title: title || 'Untitled Product',
        subtitle: [subtitle, priceDisplay, status?.toUpperCase()].filter(Boolean).join(' • '),
        media: media as any,
      }
    },
  },
})

export default product
