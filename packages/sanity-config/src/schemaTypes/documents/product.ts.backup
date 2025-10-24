import { defineType, defineField } from 'sanity'
import { googleProductCategories } from '../constants/googleProductCategories'

const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  groups: [
    { name: 'general', title: 'General' },
    { name: 'pricing', title: 'Pricing' },
    { name: 'inventory', title: 'Inventory' },
    { name: 'details', title: 'Details' },
    { name: 'upgrades', title: 'Upgrades & Add-ons' },
    { name: 'shipping', title: 'Shipping' },
    { name: 'marketing', title: 'Marketing' },
    { name: 'bundles', title: 'Bundles' },
    { name: 'media', title: 'Media' },
    { name: 'relations', title: 'Related Products' },
    { name: 'internal', title: 'Internal' },
    { name: 'filters', title: 'Filters' },
    { name: 'seo', title: 'SEO' }
  ],
  fields: [
    // GENERAL
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
      group: 'general'
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: Rule => Rule.required(),
      group: 'general'
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string',
      group: 'general'
    }),
    defineField({
      name: 'featured',
      title: 'Featured Product',
      type: 'boolean',
      group: 'general'
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description: 'Controls where the product appears in internal tools and feeds.',
      options: {
        layout: 'radio',
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Draft', value: 'draft'},
          {title: 'Paused', value: 'paused'},
          {title: 'Archived', value: 'archived'},
        ],
      },
      initialValue: 'active',
      group: 'general',
    }),
    defineField({
      name: 'productType',
      title: 'Product Type',
      type: 'string',
      description:
        'Controls which editing fields appear in Studio (e.g., options for Variable). This does not create separate product documents.',
      initialValue: 'simple',
      options: { list: ['simple', 'variable', 'grouped', 'variation', 'custom'], layout: 'dropdown' },
      group: 'general'
    }),
    defineField({
      name: 'category',
      title: 'Categories',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'category' }] }],
      group: 'general'
    }),

    // RICH TEXT CONTENT
    defineField({
      name: 'description',
      title: 'Description',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            { title: 'Normal', value: 'normal' },
            { title: 'H2', value: 'h2' },
            { title: 'H3', value: 'h3' }
          ],
          lists: [
            { title: 'Bullet', value: 'bullet' },
            { title: 'Numbered', value: 'number' }
          ],
          marks: {
            decorators: [
              { title: 'Bold', value: 'strong' },
              { title: 'Italic', value: 'em' },
              { title: 'Underline', value: 'underline' }
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [{ name: 'href', type: 'url', title: 'URL' }]
              }
            ]
          }
        },
        { type: 'image', options: { hotspot: true } },
        { type: 'code' }
      ],
      description: 'Full product description with formatting, lists, and headings.',
      group: 'details'
    }),
    defineField({
      name: 'shortDescription',
      title: 'Short Description',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [{ title: 'Normal', value: 'normal' }],
          lists: [{ title: 'Bullet', value: 'bullet' }],
          marks: {
            decorators: [
              { title: 'Bold', value: 'strong' },
              { title: 'Italic', value: 'em' }
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [{ name: 'href', type: 'url', title: 'URL' }]
              }
            ]
          }
        },
        { type: 'image', options: { hotspot: true } },
        { type: 'code' }
      ],
      description: 'Brief intro near title/price (aim for 1–2 sentences).',
      validation: (Rule) => Rule.max(2).warning('Keep the short description concise (1–2 paragraphs).'),
      group: 'details'
    }),
    defineField({
      name: 'importantNotes',
      title: 'Important Notes',
      type: 'array',
      of: [{ type: 'block' }],
      description: 'Critical information the customer must acknowledge before ordering. Displayed prominently on the product page.',
      group: 'details'
    }),
    defineField({
      name: 'productHighlights',
      title: 'Product Highlights',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Short bullet-style highlights (<=150 characters each) shown in Shopping listings.',
      group: 'details'
    }),
    defineField({
      name: 'productDetails',
      title: 'Product Details',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Additional detail lines formatted as "section_name: attribute_name: attribute_value".',
      group: 'details'
    }),
    defineField({ name: 'color', title: 'Color', type: 'string', group: 'details' }),
    defineField({ name: 'size', title: 'Size', type: 'string', group: 'details' }),
    defineField({ name: 'material', title: 'Material', type: 'string', group: 'details' }),
    defineField({ name: 'productLength', title: 'Product Length', type: 'string', description: 'Example: 10 in', group: 'details' }),
    defineField({ name: 'productWidth', title: 'Product Width', type: 'string', description: 'Example: 4 in', group: 'details' }),

    // PRICING & INVENTORY
    defineField({ name: 'price', title: 'Price', type: 'number', group: 'pricing' }),
    defineField({ name: 'salePrice', title: 'Sale Price', type: 'number', group: 'pricing' }),
    defineField({ name: 'onSale', title: 'On Sale?', type: 'boolean', group: 'pricing' }),
    defineField({
      name: 'taxBehavior',
      title: 'Tax Behavior',
      type: 'string',
      description: 'Controls how this product is taxed when building invoices or Stripe checkout sessions.',
      options: {
        list: [
          {title: 'Taxable', value: 'taxable'},
          {title: 'Tax Exempt', value: 'exempt'},
        ],
        layout: 'radio',
      },
      initialValue: 'taxable',
      group: 'pricing',
    }),
    defineField({
      name: 'taxCode',
      title: 'Tax Code (optional)',
      type: 'string',
      description: 'Optional Stripe or internal tax code to map this product to a specific tax category.',
      group: 'pricing',
      hidden: ({parent}) => parent?.taxBehavior === 'exempt',
    }),
    defineField({ name: 'pricingTiers', title: 'Pricing Tiers', type: 'array', of: [
      { type: 'pricingTier' }
    ], group: 'pricing' }),
    defineField({
      name: 'stripeProductId',
      title: 'Stripe Product ID',
      type: 'string',
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripeDefaultPriceId',
      title: 'Stripe Default Price ID',
      type: 'string',
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripePriceId',
      title: 'Stripe Primary Price ID',
      type: 'string',
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripeActive',
      title: 'Stripe Active',
      type: 'boolean',
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripeUpdatedAt',
      title: 'Stripe Updated At',
      type: 'datetime',
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripePrices',
      title: 'Stripe Prices',
      type: 'array',
      of: [{ type: 'stripePriceSnapshot' }],
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'stripeMetadata',
      title: 'Stripe Product Metadata',
      type: 'array',
      of: [{ type: 'stripeMetadataEntry' }],
      readOnly: true,
      group: 'pricing',
    }),
    defineField({
      name: 'availability',
      title: 'Availability',
      type: 'string',
      description: 'Google Shopping availability flag used in feeds and storefront messaging.',
      options: {
        list: [
          {title: 'In stock', value: 'in_stock'},
          {title: 'Out of stock', value: 'out_of_stock'},
          {title: 'Preorder', value: 'preorder'},
          {title: 'Backorder', value: 'backorder'},
        ],
        layout: 'radio',
      },
      initialValue: 'in_stock',
      group: 'inventory',
    }),
    defineField({
      name: 'condition',
      title: 'Product Condition',
      type: 'string',
      description: 'Required for Google Shopping when the product is used or refurbished.',
      options: {
        list: [
          {title: 'New', value: 'new'},
          {title: 'Refurbished', value: 'refurbished'},
          {title: 'Used', value: 'used'},
        ],
        layout: 'radio',
      },
      initialValue: 'new',
      group: 'inventory',
    }),
    defineField({
      name: 'manualInventoryCount',
      title: 'Manual Inventory Count',
      type: 'number',
      description: 'Optional stock quantity for products tracked outside connected systems.',
      validation: (Rule) => Rule.min(0).warning('Inventory cannot be negative.'),
      group: 'inventory',
    }),

    // VARIANTS & RELATIONS
    // PRODUCT OPTIONS (embedded; does not create new product docs)
    defineField({
      name: 'options',
      title: 'Options',
      description:
        'Selectable options for this product (e.g., Color, Size). Used for pickers on the product page; does not create separate product documents.',
      type: 'array',
      of: [
        { type: 'customProductOption.color' },
        { type: 'customProductOption.size' },
        { type: 'customProductOption.custom' }
      ],
      hidden: ({ parent }) => parent?.productType !== 'variable',
      validation: (Rule) =>
        Rule.custom((options, context) => {
          const productType = (context?.parent as {productType?: string} | undefined)?.productType
          if (productType !== 'variable') return true

          if (!Array.isArray(options) || options.length === 0) {
            return 'Add at least one option set for variable products.'
          }

          const hasEmptySet = options.some((option: any) => {
            if (!option) return true
            if (option._type === 'customProductOption.color') {
              return !Array.isArray(option.colors) || option.colors.length === 0
            }
            if (option._type === 'customProductOption.size') {
              return !Array.isArray(option.sizes) || option.sizes.length === 0
            }
            if (option._type === 'customProductOption.custom') {
              return !Array.isArray(option.values) || option.values.length === 0
            }
            return false
          })

          if (hasEmptySet) {
            return 'Each option must include at least one selectable choice.'
          }

          return true
        }),
      group: 'details'
    }),
    // Deprecated: replaced by "options" above. Kept visible only if existing values are present.
    defineField({
      name: 'variationOptions',
      title: 'Variation Options (deprecated)',
      type: 'array',
      of: [{ type: 'string' }],
      readOnly: true,
      description: 'Deprecated. Use the Options field above (Color/Size, etc.).',
      hidden: ({ parent }) => {
        const isVariable = parent?.productType === 'variable'
        const hasValues = Array.isArray(parent?.variationOptions) && parent.variationOptions.length > 0
        return !isVariable || !hasValues
      },
      group: 'details'
    }),
    defineField({
      name: 'parentProduct',
      title: 'Parent Product',
      type: 'reference',
      to: [{ type: 'product' }],
      hidden: ({ parent }) => parent?.productType !== 'variation',
      group: 'details'
    }),

    // CUSTOM PAINT
    defineField({
      name: 'customPaint',
      title: 'Custom Paint',
      type: 'customPaint',
      group: 'upgrades'
    }),
    defineField({
      name: 'addOns',
      title: 'Optional Upgrades',
      type: 'array',
      of: [ { type: 'addOn' } ],
      description: 'Checkbox-style add-ons (e.g., ceramic bearings +$500, paint service +$X). Customer can pick none, one, or many.',
      group: 'upgrades'
    }),

    // SPECIFICATIONS (key/value)
    defineField({
      name: 'specifications',
      title: 'Specifications',
      type: 'array',
      description: 'Technical key/value facts shown in a structured table (e.g., Material, Finish, Diameter, Weight).',
      of: [ { type: 'specItem' } ],
      options: { sortable: true },
      group: 'details'
    }),

    // INCLUDED IN KIT
    defineField({
      name: 'includedInKit',
      title: 'Included in Kit',
      type: 'array',
      of: [ { type: 'kitItem' } ],
      description: 'What’s in the installation kit (e.g., bolts, gaskets, wiring).',
      group: 'details'
    }),

    // ATTRIBUTES
    defineField({
      name: 'attributes',
      title: 'Product Attributes',
      type: 'array',
      of: [ { type: 'attribute' } ],
      description: 'Freeform descriptive traits for filtering/quick info (e.g., Color: Gloss Black, Finish: Anodized, Compat: Charger/Challenger). Use this for descriptive tags that aren’t technical specs or kit contents.',
      group: 'details'
    }),

    // MEDIA
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{
        type: 'image',
        fields: [{ name: 'alt', title: 'Alt Text', type: 'string', description: 'Describe the image for accessibility & SEO (e.g., “Black anodized Hellcat pulley kit on engine”).' }],
        options: { hotspot: true }
      }],
      group: 'media'
    }),
    defineField({
      name: 'mediaAssets',
      title: 'Media Assets',
      type: 'array',
      of: [ { type: 'mediaItem' } ],
      group: 'media'
    }),

    // RELATIONS
    defineField({
      name: 'compatibleVehicles',
      title: 'Compatible Vehicles (Linked)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'vehicleModel' }] }],
      group: 'relations'
    }),
    defineField({ name: 'relatedProducts', title: 'Related Products', type: 'array', of: [{ type: 'reference', to: [{ type: 'product' }] }], group: 'relations' }),
    defineField({ name: 'upsellProducts', title: 'Upsell Products', type: 'array', of: [{ type: 'reference', to: [{ type: 'product' }] }], group: 'relations' }),

    // MARKETING
    defineField({ name: 'promotionTagline', title: 'Promotion Tagline', type: 'string', description: 'Displayed in marketing banners or callouts.', group: 'marketing' }),
    defineField({ name: 'promotionActive', title: 'Promotion Active?', type: 'boolean', initialValue: false, group: 'marketing' }),
    defineField({ name: 'promotionStartDate', title: 'Promotion Start Date', type: 'datetime', hidden: ({ parent }) => !parent?.promotionActive, group: 'marketing' }),
    defineField({ name: 'promotionEndDate', title: 'Promotion End Date', type: 'datetime', hidden: ({ parent }) => !parent?.promotionActive, group: 'marketing' }),

    // SHIPPING
    defineField({ name: 'shippingWeight', title: 'Shipping Weight (lbs)', type: 'number', group: 'shipping' }),
    defineField({ name: 'boxDimensions', title: 'Box Dimensions', type: 'string', description: 'Example: 18x12x10 inches', group: 'shipping' }),
    defineField({
      name: 'installOnly',
      title: 'Install Only (No Shipping)',
      type: 'boolean',
      description: 'Mark when this item can only be installed/picked up in-store and should be excluded from shipping quotes.',
      initialValue: false,
      group: 'shipping',
    }),
    defineField({
      name: 'shippingLabel',
      title: 'Google Shipping Label',
      type: 'string',
      description: 'Optional label sent with Google Shopping feed (e.g., install_only) so Merchant Center shipping rules can target this product.',
      group: 'shipping',
    }),
    defineField({
      name: 'shippingClass',
      title: 'Shipping Class',
      type: 'string',
      options: {
        list: ['Standard', 'Oversized', 'Freight', 'Free Shipping', 'Install Only'],
        layout: 'dropdown',
      },
      description: 'Used to calculate shipping rates or rules based on product class. “Install Only” skips shipping calculations.',
      group: 'shipping',
    }),
    defineField({ name: 'shipsAlone', title: 'Ships Alone?', type: 'boolean', description: 'Enable if this item must be shipped separately due to size or fragility.', group: 'shipping' }),
    defineField({ name: 'handlingTime', title: 'Estimated Handling Time (Days)', type: 'number', description: 'Days before the product ships. Used in estimated delivery time.', group: 'shipping' }),
    defineField({ name: 'specialShippingNotes', title: 'Shipping Notes', type: 'text', description: 'Internal notes or customer messages about delivery or packaging.', group: 'shipping' }),

    // INTERNAL
    defineField({ name: 'coreRequired', title: 'Core Return Required', type: 'boolean', group: 'internal' }),
    defineField({ name: 'coreNotes', title: 'Core Return Notes', type: 'text', hidden: ({ parent }) => !parent?.coreRequired, group: 'internal' }),

    // FILTER TAGS
    defineField({
      name: 'filters',
      title: 'Filters',
      type: 'array',
      of: [{
        type: 'reference',
        to: [{ type: 'filterTag' }],
      }],
      description: 'Pick from Filters. Manage filters in the Filters section.',
      group: 'filters'
    }),

    // SEO
    defineField({
      name: 'schemaMarkup',
      title: 'Schema Markup',
      type: 'schemaMarkup',
      description: 'Generate product-specific structured data for storefront SEO.',
      group: 'seo',
    }),
    defineField({ name: 'brand', title: 'Brand / Manufacturer', type: 'string', description: 'Brand name (helps Google understand the product).', group: 'seo' }),
    defineField({
      name: 'googleProductCategory',
      title: 'Google Product Category',
      type: 'string',
      options: {
        list: googleProductCategories.map((category) => ({ title: category, value: category })),
      },
      description: 'Select the closest Google taxonomy category for Shopping feeds.',
      group: 'seo'
    }),
    defineField({ name: 'gtin', title: 'GTIN (UPC/EAN/ISBN)', type: 'string', description: 'Global Trade Item Number, if applicable.', group: 'seo' }),
    defineField({ name: 'mpn', title: 'MPN (Manufacturer Part Number)', type: 'string', description: 'Manufacturer part number (useful for Google / merchant feeds).', group: 'seo' }),
    defineField({ name: 'metaTitle', title: 'Meta Title', type: 'string', description: 'Title tag for search results (target ~50–60 chars).', validation: Rule => Rule.max(60).warning('Google typically shows up to ~60 characters.'), group: 'seo' }),
    defineField({ name: 'metaDescription', title: 'Meta Description', type: 'text', rows: 3, description: 'Short summary for search results (target ~140–160 chars).', validation: Rule => Rule.max(160).warning('Google typically shows up to ~160 characters.'), group: 'seo' }),
    defineField({ name: 'canonicalUrl', title: 'Canonical URL', type: 'url', description: 'Use to avoid duplicate content issues if this product appears at multiple URLs.', group: 'seo' }),
    defineField({ name: 'noindex', title: 'Noindex this page?', type: 'boolean', initialValue: false, description: 'Prevent indexing (e.g., staging, duplicates, discontinued).', group: 'seo' }),
    defineField({ name: 'socialImage', title: 'Social / Open Graph Image', type: 'image', options: { hotspot: true }, fields: [{ name: 'alt', title: 'Alt Text', type: 'string' }], description: 'Fallback preview image for social sharing (1200×630 recommended).', group: 'seo' })
  ]
});

export default product;
