import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'wooProduct',
  title: 'Woo Product',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required()
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96
      }
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'number'
    }),
    defineField({
      name: 'salePrice',
      title: 'Sale Price',
      type: 'number'
    }),
    defineField({
      name: 'onSale',
      title: 'On Sale?',
      type: 'boolean'
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string'
    }),
    defineField({
      name: 'inventory',
      title: 'Inventory',
      type: 'number'
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image' }]
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{ type: 'string' }],
      initialValue: []
    }),
    defineField({
      name: 'featured',
      title: 'Featured Product',
      type: 'boolean'
    }),
    defineField({
      name: 'productType',
      title: 'Product Type',
      type: 'string',
      options: {
        list: ['simple', 'variable', 'grouped', 'variation'], // Add "variation" here
        layout: 'dropdown'
      }
    }),
    defineField({
      name: 'variationOptions',
      title: 'Variation Options',
      type: 'array',
      of: [{ type: 'string' }],
      hidden: ({ parent }) => parent?.productType !== 'variable'
    }),
    defineField({
      name: 'parentProduct',
      title: 'Parent Product',
      type: 'reference',
      to: [{ type: 'wooProduct' }],
      hidden: ({ parent }) => parent?.productType !== 'variation'
    }),
    defineField({
      name: 'simpleProductDetails',
      title: 'Simple Product Details',
      type: 'object',
      fields: [
        { name: 'weight', type: 'number', title: 'Weight (lbs)' },
        { name: 'dimensions', type: 'string', title: 'Dimensions' }
      ],
      hidden: ({ parent }) => parent?.productType !== 'simple'
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
      ]
    }),
    defineField({
      name: 'vehicleCompatibility',
      title: 'Compatible Vehicles',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        layout: 'tags'
      }
    }),
    defineField({
      name: 'horsepowerRange',
      title: 'Recommended HP Range',
      type: 'object',
      fields: [
        { name: 'min', type: 'number', title: 'Min HP' },
        { name: 'max', type: 'number', title: 'Max HP' },
      ]
    }),
    defineField({
      name: 'partOfBundles',
      title: 'Included in Packages',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'productBundle' }] }]
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
      ]
    }),
    defineField({
      name: 'bundlePreset',
      title: 'Bundle Preset',
      type: 'reference',
      to: [{ type: 'productBundle' }],
      description: 'If this product is a pre-configured bundle, link it here.'
    }),
    defineField({
      name: 'compatibleVehicles',
      title: 'Compatible Vehicles (Linked)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'vehicleModel' }] }]
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
      ]
    }),
    defineField({
      name: 'installDifficulty',
      title: 'Installation Difficulty',
      type: 'string',
      options: {
        list: ['Easy', 'Intermediate', 'Advanced'],
        layout: 'dropdown'
      }
    }),
    defineField({
      name: 'installNotes',
      title: 'Installation Notes',
      type: 'text'
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
      ]
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
      ]
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'wooProduct' }] }]
    }),
    defineField({
      name: 'upsellProducts',
      title: 'Upsell Products',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'wooProduct' }] }]
    }),
    defineField({
      name: 'promotionTagline',
      title: 'Promotion Tagline',
      type: 'string',
      description: 'Displayed in marketing banners or callouts.'
    }),
    defineField({
      name: 'promotionActive',
      title: 'Promotion Active?',
      type: 'boolean',
      initialValue: false
    }),
    defineField({
      name: 'promotionStartDate',
      title: 'Promotion Start Date',
      type: 'datetime',
      hidden: ({ parent }) => !parent?.promotionActive
    }),
    defineField({
      name: 'promotionEndDate',
      title: 'Promotion End Date',
      type: 'datetime',
      hidden: ({ parent }) => !parent?.promotionActive
    }),
    defineField({
      name: 'coreRequired',
      title: 'Core Return Required',
      type: 'boolean'
    }),
    defineField({
      name: 'coreNotes',
      title: 'Core Return Notes',
      type: 'text',
      hidden: ({ parent }) => !parent?.coreRequired
    }),
    defineField({
      name: 'condition',
      title: 'Product Condition',
      type: 'string',
      options: {
        list: ['New', 'Used', 'Refurbished'],
        layout: 'dropdown'
      }
    }),
    defineField({
      name: 'shippingWeight',
      title: 'Shipping Weight (lbs)',
      type: 'number'
    }),
    defineField({
      name: 'boxDimensions',
      title: 'Box Dimensions',
      type: 'string',
      description: 'Example: 18x12x10 inches'
    }),
    defineField({
      name: 'shippingClass',
      title: 'Shipping Class',
      type: 'string',
      options: {
        list: ['Standard', 'Oversized', 'Freight', 'Hazardous', 'Free Shipping'],
        layout: 'dropdown'
      },
      description: 'Used to calculate shipping rates or rules based on product class.'
    }),
    defineField({
      name: 'shipsAlone',
      title: 'Ships Alone?',
      type: 'boolean',
      description: 'Enable if this item must be shipped separately due to size or fragility.'
    }),
    defineField({
      name: 'handlingTime',
      title: 'Estimated Handling Time (Days)',
      type: 'number',
      description: 'Number of days before the product ships. Used in estimated delivery time.'
    }),
    defineField({
      name: 'specialShippingNotes',
      title: 'Shipping Notes',
      type: 'text',
      description: 'Internal notes or messages for customers about delivery or packaging.'
    }),
    defineField({
      name: 'recommendedUse',
      title: 'Recommended Use',
      type: 'string',
      options: {
        list: ['Street', 'Track', 'Off-Road', 'Show', 'All-Purpose'],
        layout: 'dropdown'
      }
    })
  ]
});

// Customer Database
export const customer = defineType({
  name: 'customer',
  title: 'Customer',
  type: 'document',
  fields: [
    defineField({ name: 'fullName', title: 'Full Name', type: 'string' }),
    defineField({ name: 'email', title: 'Email', type: 'string' }),
    defineField({ name: 'phone', title: 'Phone', type: 'string' }),
    defineField({ name: 'address', title: 'Address', type: 'text' }),
    defineField({ name: 'vehicle', title: 'Vehicle Info', type: 'string' }),
    defineField({ name: 'notes', title: 'Notes', type: 'text' })
  ]
})

// Build Quote for Garage Builder
export const buildQuote = defineType({
  name: 'buildQuote',
  title: 'Build Quote',
  type: 'document',
  fields: [
    defineField({ name: 'customer', title: 'Customer', type: 'reference', to: [{ type: 'customer' }] }),
    defineField({ name: 'selectedProducts', title: 'Selected Products', type: 'array', of: [{ type: 'reference', to: [{ type: 'wooProduct' }] }] }),
    defineField({ name: 'targetHP', title: 'Target Horsepower', type: 'number' }),
    defineField({ name: 'buildPurpose', title: 'Build Purpose', type: 'string', options: { list: ['Street', 'Track', 'Show', 'All-Purpose'] } }),
    defineField({ name: 'quoteTotal', title: 'Quote Total', type: 'number' }),
    defineField({ name: 'status', title: 'Status', type: 'string', options: { list: ['Draft', 'Sent', 'Approved', 'Rejected'] }, initialValue: 'Draft' }),
    defineField({ name: 'createdAt', title: 'Created At', type: 'datetime', initialValue: () => new Date().toISOString() })
  ]
})
