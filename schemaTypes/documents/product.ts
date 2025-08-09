import { defineType, defineField } from 'sanity'

const product = defineType({
    name: 'product',
    title: 'Product',
    type: 'document',
    groups: [
      { name: 'general', title: 'General' },
      { name: 'pricing', title: 'Pricing' },
      { name: 'inventory', title: 'Inventory' },
      { name: 'details', title: 'Details' },
      { name: 'shipping', title: 'Shipping' },
      { name: 'marketing', title: 'Marketing' },
      { name: 'bundles', title: 'Bundles' },
      { name: 'media', title: 'Media' },
      { name: 'relations', title: 'Related Products' },
      { name: 'internal', title: 'Internal' },
      { name: 'filters', title: 'Filters' }
    ],
    fields: [
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
        options: {
          source: 'title',
          maxLength: 96
        },
        group: 'general'
      }),
      defineField({
        name: 'description',
        title: 'Description',
        type: 'text',
        group: 'details'
      }),
      defineField({
        name: 'price',
        title: 'Price',
        type: 'number',
        group: 'pricing'
      }),
      defineField({
        name: 'salePrice',
        title: 'Sale Price',
        type: 'number',
        group: 'pricing'
      }),
      defineField({
        name: 'onSale',
        title: 'On Sale?',
        type: 'boolean',
        group: 'pricing'
      }),
      defineField({
        name: 'sku',
        title: 'SKU',
        type: 'string',
        group: 'general'
      }),
      defineField({
        name: 'inventory',
        title: 'Inventory',
        type: 'number',
        group: 'inventory'
      }),
      defineField({
        name: 'images',
        title: 'Images',
        type: 'array',
        of: [{ type: 'image' }],
        group: 'media'
      }),
      defineField({
        name: 'category',
        title: 'Categories',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'category' }] }],
        options: {
          layout: 'tags'
        },
        group: 'general'
      }),
      defineField({
        name: 'featured',
        title: 'Featured Product',
        type: 'boolean',
        group: 'general'
      }),
      defineField({
        name: 'productType',
        title: 'Product Type',
        type: 'string',
        options: {
          list: ['simple', 'variable', 'grouped', 'variation'], // Add "variation" here
          layout: 'dropdown'
        },
        group: 'general'
      }),
      defineField({
        name: 'variationOptions',
        title: 'Variation Options',
        type: 'array',
        of: [{ type: 'string' }],
        hidden: ({ parent }) => parent?.productType !== 'variable',
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
      defineField({
        name: 'simpleProductDetails',
        title: 'Simple Product Details',
        type: 'object',
        fields: [
          { name: 'weight', type: 'number', title: 'Weight (lbs)' },
          { name: 'dimensions', type: 'string', title: 'Dimensions' }
        ],
        hidden: ({ parent }) => parent?.productType !== 'simple',
        group: 'details'
      }),
      defineField({
        name: 'specifications',
        title: 'Specifications',
        type: 'array',
        of: [
          {
            type: 'object',
            name: 'specItem',
            fields: [
              { name: 'label', type: 'string', title: 'Label' },
              { name: 'value', type: 'string', title: 'Value' },
            ]
          }
        ],
        group: 'details'
      }),
      defineField({
        name: 'horsepowerRange',
        title: 'Recommended HP Range',
        type: 'object',
        fields: [
          { name: 'min', type: 'number', title: 'Min HP' },
          { name: 'max', type: 'number', title: 'Max HP' },
        ],
        group: 'details'
      }),
      defineField({
        name: 'averageHorsepower',
        title: 'Average Horsepower',
        type: 'number',
        description: 'Derived for filtering purposes. Not shown to users.',
        hidden: true,
        group: 'details'
      }),
      defineField({
        name: 'partOfBundles',
        title: 'Included in Packages',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'productBundle' }] }],
        group: 'bundles'
      }),
      defineField({
        name: 'pricingTiers',
        title: 'Pricing Tiers',
        type: 'array',
        of: [
          {
            type: 'object',
            name: 'pricingTier',
            fields: [
              { name: 'label', type: 'string', title: 'Tier Name' },
              { name: 'price', type: 'number', title: 'Price' }
            ]
          }
        ],
        group: 'pricing'
      }),
      defineField({
        name: 'bundlePreset',
        title: 'Bundle Preset',
        type: 'reference',
        to: [{ type: 'productBundle' }],
        description: 'If this product is a pre-configured bundle, link it here.',
        group: 'bundles'
      }),
      defineField({
        name: 'compatibleVehicles',
        title: 'Compatible Vehicles (Linked)',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'vehicleModel' }] }],
        
        group: 'relations'
      }),
      defineField({
  name: 'filters',
  title: 'Filters',
  type: 'array',
  of: [{ type: 'string' }],
  options: {
    layout: 'tags',
  },
  group: 'filters'
}),
      defineField({
        name: 'attributes',
        title: 'Product Attributes',
        type: 'array',
        of: [
          {
            type: 'object',
            name: 'attribute',
            fields: [
              { name: 'name', type: 'string', title: 'Attribute Name' },
              { name: 'value', type: 'string', title: 'Value' }
            ]
          }
        ],
        group: 'details'
      }),
      defineField({
        name: 'installDifficulty',
        title: 'Installation Difficulty',
        type: 'string',
        options: {
          list: ['Easy', 'Intermediate', 'Advanced'],
          layout: 'dropdown'
        },
        group: 'details'
      }),
      defineField({
        name: 'installNotes',
        title: 'Installation Notes',
        type: 'text',
        group: 'details'
      }),
      defineField({
        name: 'mediaAssets',
        title: 'Media Assets',
        type: 'array',
        of: [
          {
            type: 'object',
            name: 'mediaItem',
            fields: [
              { name: 'type', type: 'string', title: 'Type', options: { list: ['video', '3d', 'image', 'pdf'] } },
              { name: 'label', type: 'string', title: 'Label' },
              { name: 'url', type: 'url', title: 'URL' }
            ]
          }
        ],
        group: 'media'
      }),
      defineField({
        name: 'reviews',
        title: 'Customer Reviews',
        type: 'array',
        of: [
          {
            type: 'object',
            name: 'review',
            fields: [
              { name: 'author', type: 'string', title: 'Name' },
              { name: 'rating', type: 'number', title: 'Rating (1–5)' },
              { name: 'comment', type: 'text', title: 'Comment' }
            ]
          }
        ],
        group: 'relations'
      }),
      defineField({
        name: 'relatedProducts',
        title: 'Related Products',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'product' }] }],
        group: 'relations'
      }),
      defineField({
        name: 'upsellProducts',
        title: 'Upsell Products',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'product' }] }],
        group: 'relations'
      }),
      defineField({
        name: 'promotionTagline',
        title: 'Promotion Tagline',
        type: 'string',
        description: 'Displayed in marketing banners or callouts.',
        group: 'marketing'
      }),
      defineField({
        name: 'promotionActive',
        title: 'Promotion Active?',
        type: 'boolean',
        initialValue: false,
        group: 'marketing'
      }),
      defineField({
        name: 'promotionStartDate',
        title: 'Promotion Start Date',
        type: 'datetime',
        hidden: ({ parent }) => !parent?.promotionActive,
        group: 'marketing'
      }),
      defineField({
        name: 'promotionEndDate',
        title: 'Promotion End Date',
        type: 'datetime',
        hidden: ({ parent }) => !parent?.promotionActive,
        group: 'marketing'
      }),
      defineField({
        name: 'coreRequired',
        title: 'Core Return Required',
        type: 'boolean',
        group: 'internal'
      }),
      defineField({
        name: 'coreNotes',
        title: 'Core Return Notes',
        type: 'text',
        hidden: ({ parent }) => !parent?.coreRequired,
        group: 'internal'
      }),
      defineField({
        name: 'condition',
        title: 'Product Condition',
        type: 'string',
        options: {
          list: ['New', 'Used', 'Refurbished'],
          layout: 'dropdown'
        },
        group: 'internal'
      }),
      defineField({
        name: 'shippingWeight',
        title: 'Shipping Weight (lbs)',
        type: 'number',
        group: 'shipping'
      }),
      defineField({
        name: 'boxDimensions',
        title: 'Box Dimensions',
        type: 'string',
        description: 'Example: 18x12x10 inches',
        group: 'shipping'
      }),
      defineField({
        name: 'shippingClass',
        title: 'Shipping Class',
        type: 'string',
        options: {
          list: ['Standard', 'Oversized', 'Freight', 'Hazardous', 'Free Shipping'],
          layout: 'dropdown'
        },
        description: 'Used to calculate shipping rates or rules based on product class.',
        group: 'shipping'
      }),
      defineField({
        name: 'shipsAlone',
        title: 'Ships Alone?',
        type: 'boolean',
        description: 'Enable if this item must be shipped separately due to size or fragility.',
        group: 'shipping'
      }),
      defineField({
        name: 'handlingTime',
        title: 'Estimated Handling Time (Days)',
        type: 'number',
        description: 'Number of days before the product ships. Used in estimated delivery time.',
        group: 'shipping'
      }),
      defineField({
        name: 'specialShippingNotes',
        title: 'Shipping Notes',
        type: 'text',
        description: 'Internal notes or messages for customers about delivery or packaging.',
        group: 'shipping'
      }),
      defineField({
        name: 'recommendedUse',
        title: 'Recommended Use',
        type: 'string',
        options: {
          list: ['Street', 'Track', 'Off-Road', 'Show', 'All-Purpose'],
          layout: 'dropdown'
        },
        group: 'details'
      }),
      defineField({
        name: 'tune',
        title: 'Tune',
        type: 'reference',
        to: [{ type: 'tune' }],
        
        group: 'details'
      })
    ]
  });

export default product;