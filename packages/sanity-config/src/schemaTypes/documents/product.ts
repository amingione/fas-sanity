import React, {useEffect} from 'react'
import {defineType, defineField, set} from 'sanity'
import type {BooleanInputProps, BooleanSchemaType, StringInputProps, StringSchemaType} from 'sanity'
import {googleProductCategories} from '../constants/googleProductCategories'
import ProductImageAltReferenceInput from '../../components/inputs/ProductImageAltReferenceInput'
import ProductJsonLdPreview from '../../components/studio/ProductJsonLdPreview'
import SeoCharacterCountInput from '../../components/inputs/SeoCharacterCountInput'
import FocusKeywordInput from '../../components/inputs/FocusKeywordInput'
import ShippingCalculatorPreview from '../../components/inputs/ShippingCalculatorPreview'
import ProductMarketingInsights from '../../components/studio/ProductMarketingInsights'
import WholesalePricingControls from '../../components/inputs/WholesalePricingControls'
import SalePricingInput from '../../components/inputs/SalePricingInput'
import {generateInitialMpn} from '../../utils/generateProductCodes'

const PRODUCT_PLACEHOLDER_ASSET = 'image-c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000-png'
const PRODUCT_API_VERSION = '2024-10-01'

type CanonicalFieldProps = StringInputProps<StringSchemaType> & {document?: any}

const CanonicalUrlField: React.ComponentType<CanonicalFieldProps> = (props) => {
  const slug = props.document?.slug?.current
  const autoValue = slug ? `https://fasmotorsports.com/products/${slug}` : ''
  const {value, onChange} = props

  useEffect(() => {
    if (!onChange) return
    if (!autoValue) return
    if (!value) {
      onChange(set(autoValue))
    }
  }, [autoValue, value, onChange])

  return props.renderDefault(props)
}

type VisibilityContext = {
  document?: Record<string, any>
  parent?: Record<string, any>
}

const resolveProductType = (context?: VisibilityContext): string => {
  const docType = context?.document?.productType || context?.parent?.productType
  return docType || 'physical'
}

const isPhysicalOrBundle = (context?: VisibilityContext): boolean => {
  const type = resolveProductType(context)
  return type === 'physical' || type === 'bundle'
}

const isServiceProduct = (context?: VisibilityContext): boolean =>
  resolveProductType(context) === 'service'

const isBundleProduct = (context?: VisibilityContext): boolean =>
  resolveProductType(context) === 'bundle'

const SHIPPING_CLASS_VALUES = ['standard', 'oversized', 'fragile', 'hazmat', 'install_only']

const normalizeShippingClass = (value?: string | null) =>
  typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, '_') : undefined

const parseShippingDimensions = (value?: string | null) => {
  if (!value || typeof value !== 'string') return null
  const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  const [, rawLength, rawWidth, rawHeight] = match
  const length = Number.parseFloat(rawLength)
  const width = Number.parseFloat(rawWidth)
  const height = Number.parseFloat(rawHeight)
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null
  return {
    length,
    width,
    height,
  }
}

const normalizeShippingNumber = (value?: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

type BooleanFieldWithDocument = BooleanInputProps<BooleanSchemaType> & {document?: any}

type StringFieldWithDocument = StringInputProps<StringSchemaType> & {document?: any}

type ShippingVisibilityContext = VisibilityContext & {parent?: Record<string, any>}

const shouldRequireShippingDetails = (context?: ShippingVisibilityContext): boolean => {
  const requiresFromParent = (context?.parent as any)?.requiresShipping
  if (typeof requiresFromParent === 'boolean') return requiresFromParent

  const requiresFromDoc = (context?.document as any)?.shippingConfig?.requiresShipping
  if (typeof requiresFromDoc === 'boolean') return requiresFromDoc

  const productType = resolveProductType(context)
  const deliveryModel =
    (context?.parent as any)?.serviceDeliveryModel ||
    (context?.document as any)?.serviceDeliveryModel

  if (productType === 'service') {
    if (deliveryModel === 'mail-in-service' || deliveryModel === 'hybrid') return true
    return false
  }

  return productType !== 'service'
}

const isCallForShippingQuote = (context?: ShippingVisibilityContext): boolean => {
  const quoteFromParent = (context?.parent as any)?.callForShippingQuote
  if (typeof quoteFromParent === 'boolean') return quoteFromParent

  const quoteFromDoc = (context?.document as any)?.shippingConfig?.callForShippingQuote
  return quoteFromDoc === true
}

const merchantFieldWarning = (Rule: any, message: string) =>
  Rule.custom((value: unknown, context: any) => {
    const doc = context?.document || {}
    const status = doc?.status
    if (status && status !== 'active') return true
    const productType =
      typeof doc?.productType === 'string' ? doc.productType.toLowerCase() : 'physical'
    if (productType === 'service') return true
    if (typeof value === 'number') return Number.isFinite(value) ? true : message
    if (typeof value === 'string') return value.trim() ? true : message
    if (value) return true
    return message
  }).warning()

const RequiresShippingField: React.ComponentType<BooleanFieldWithDocument> = (props) => {
  const productType = resolveProductType({document: props.document})
  const deliveryModel = props.document?.serviceDeliveryModel
  const shouldDisableShipping =
    productType === 'service' && deliveryModel !== 'mail-in-service' && deliveryModel !== 'hybrid'
  const onChange = props.onChange

  useEffect(() => {
    if (!onChange) return
    if (!shouldDisableShipping) return
    if (props.value === false) return
    onChange(set(false))
  }, [shouldDisableShipping, onChange, props.value])

  return props.renderDefault(props)
}

const ShippingClassField: React.ComponentType<StringFieldWithDocument> = (props) => {
  const normalized = normalizeShippingClass(props.value as string)
  const onChange = props.onChange

  useEffect(() => {
    if (!onChange) return
    if (!props.value) return
    if (!normalized) return
    if (!SHIPPING_CLASS_VALUES.includes(normalized)) return
    if (normalized === props.value) return
    onChange(set(normalized))
  }, [normalized, onChange, props.value])

  return props.renderDefault(props)
}

const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  groups: [
    {name: 'basic', title: 'Basic Info', default: true},
    {name: 'details', title: 'Product Details'},
    {name: 'options', title: 'Options & Variants'},
    {name: 'shipping', title: 'Shipping & Fulfillment'},
    {name: 'service', title: 'Service Details'},
    {name: 'bundle', title: 'Bundle Components'},
    {name: 'inventory', title: 'Inventory'},
    {name: 'compatibility', title: 'Vehicle Compatibility'},
    {name: 'wholesale', title: 'Wholesale Pricing'},
    {name: 'seo', title: 'SEO & Marketing'},
    {name: 'stripe', title: 'Stripe Sync'},
    {name: 'advanced', title: 'Advanced'},
  ],
  fieldsets: [
    {
      name: 'productDetails',
      title: 'Product Storytelling',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'optionsAndVariants',
      title: 'Options & Variants',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'shippingDetails',
      title: 'Shipping Requirements',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'serviceDetails',
      title: 'Service Logistics',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'bundleContents',
      title: 'Bundle Components',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'inventorySettings',
      title: 'Inventory',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'compatibilityDetails',
      title: 'Vehicle Compatibility',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'wholesalePricing',
      title: 'Wholesale Pricing',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'seo',
      title: 'SEO & Marketing',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'seoAdvanced',
      title: 'Advanced SEO Controls',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'stripe',
      title: 'Stripe Sync (read only)',
      options: {collapsible: true, collapsed: true},
    },
    {
      name: 'merchant',
      title: 'Merchant & Advanced',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Product name as it appears on the website and in Google search results.',
      validation: (Rule) =>
        Rule.required().max(100).error('Title is required and should stay under 100 characters.'),
      group: 'basic',
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      description: 'Auto-generated from the title. Used for storefront URLs and canonical links.',
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description: 'Controls product visibility across the storefront and API.',
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
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'productType',
      title: 'Product Type',
      type: 'string',
      description:
        'What kind of offer this is so the correct fields, badges, and catalogs are shown.',
      options: {
        layout: 'radio',
        list: [
          {title: '🔧 Physical Product (ships to customer)', value: 'physical'},
          {title: '⚙️ Service (installation, tuning, labor)', value: 'service'},
          {title: '📦 Bundle/Package (multiple items)', value: 'bundle'},
        ],
      },
      initialValue: 'physical',
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'sku',
      title: 'SKU',
      type: 'string',
      description: 'Auto-generated on product creation.',
      readOnly: true,
      group: 'basic',
    }),
    defineField({
      name: 'price',
      title: 'Price (USD)',
      type: 'number',
      description: 'Base price in USD. Sale pricing or shipping fees are managed elsewhere.',
      validation: (Rule) => Rule.required().min(0),
      group: 'basic',
    }),
    defineField({
      name: 'manufacturingCost',
      title: 'Manufacturing Cost (USD)',
      type: 'number',
      description: 'Internal cost to produce or assemble this product. Used for margin analysis.',
      validation: (Rule) => Rule.min(0),
      group: 'wholesale',
      fieldset: 'wholesalePricing',
    }),
    defineField({
      name: 'wholesalePricingHelper',
      title: 'Wholesale Pricing Helper',
      type: 'string',
      group: 'wholesale',
      fieldset: 'wholesalePricing',
      components: {input: WholesalePricingControls},
    }),
    defineField({
      name: 'wholesalePriceStandard',
      title: 'Wholesale Price – Standard',
      type: 'number',
      description: 'Pricing for standard vendors.',
      validation: (Rule) => Rule.min(0),
      group: 'wholesale',
      fieldset: 'wholesalePricing',
      hidden: ({document}) => document?.productType === 'service',
    }),
    defineField({
      name: 'wholesalePricePreferred',
      title: 'Wholesale Price – Preferred',
      type: 'number',
      description: 'Pricing for preferred vendors.',
      validation: (Rule) => Rule.min(0),
      group: 'wholesale',
      fieldset: 'wholesalePricing',
      hidden: ({document}) => document?.productType === 'service',
    }),
    defineField({
      name: 'wholesalePricePlatinum',
      title: 'Wholesale Price – Platinum',
      type: 'number',
      description: 'Pricing for platinum vendors.',
      validation: (Rule) => Rule.min(0),
      group: 'wholesale',
      fieldset: 'wholesalePricing',
      hidden: ({document}) => document?.productType === 'service',
    }),
    defineField({
      name: 'minimumWholesaleQuantity',
      title: 'Minimum Wholesale Quantity',
      type: 'number',
      validation: (Rule) => Rule.min(1),
      initialValue: 1,
      description: 'Minimum quantity required for wholesale pricing to apply.',
      group: 'wholesale',
      fieldset: 'wholesalePricing',
      hidden: ({document}) => document?.productType === 'service',
    }),
    defineField({
      name: 'availableForWholesale',
      title: 'Available for Wholesale',
      type: 'boolean',
      initialValue: true,
      description: 'When enabled, the product appears in wholesale catalogs and vendor portals.',
      group: 'wholesale',
      fieldset: 'wholesalePricing',
    }),
    defineField({
      name: 'onSale',
      title: 'On Sale?',
      type: 'boolean',
      description: 'Toggle to show a sale price badge on the storefront.',
      initialValue: false,
      group: 'basic',
    }),
    defineField({
      name: 'discountType',
      type: 'string',
      title: 'Discount Type',
      options: {
        list: [
          {title: 'Percentage Off', value: 'percentage'},
          {title: 'Fixed Dollar Amount', value: 'fixed_amount'},
        ],
        layout: 'radio',
      },
      hidden: ({document}) => !document?.onSale,
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (context.document?.onSale && !value) {
            return 'Please select a discount type'
          }
          return true
        }),
      group: 'basic',
    }),
    defineField({
      name: 'discountValue',
      type: 'number',
      title: 'Discount Value',
      description:
        'Enter percentage (e.g., 10 for 10% off) or dollar amount (e.g., 100 for $100 off).',
      hidden: ({document}) => !document?.onSale,
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (context.document?.onSale && (value === undefined || value === null)) {
            return 'Please enter a discount value'
          }
          if (value !== undefined && value !== null && value <= 0) {
            return 'Discount must be greater than 0'
          }
          return true
        }),
      group: 'basic',
    }),
    defineField({
      name: 'salePrice',
      type: 'number',
      title: 'Sale Price (USD)',
      description: 'Auto-calculated from discount type and value.',
      components: {input: SalePricingInput},
      validation: (Rule) =>
        Rule.min(0).custom((salePrice, context) => {
          const price = (context.document as any)?.price
          if (typeof salePrice === 'number' && salePrice < 0) {
            return 'Sale price cannot be negative'
          }
          if (context.document?.onSale && (salePrice === undefined || salePrice === null)) {
            return 'Sale price is required while on sale'
          }
          if (typeof salePrice === 'number' && typeof price === 'number' && salePrice >= price) {
            return 'Sale price must be less than regular price'
          }
          return true
        }),
      hidden: ({document}) => !document?.onSale,
      group: 'basic',
    }),
    defineField({
      name: 'compareAtPrice',
      type: 'number',
      title: 'Compare At Price (USD)',
      description: 'Original price to show strikethrough. Defaults to regular price if not set.',
      validation: (Rule) => Rule.min(0),
      hidden: ({document}) => !document?.onSale,
      group: 'basic',
    }),
    defineField({
      name: 'discountPercent',
      type: 'number',
      title: 'Discount Percentage',
      description: "Auto-calculated discount percentage for badges (e.g., '30% OFF')",
      readOnly: true,
      hidden: ({document}) => !document?.onSale,
      group: 'basic',
    }),
    defineField({
      name: 'saleStartDate',
      type: 'datetime',
      title: 'Sale Start Date',
      description: 'When the sale begins. Leave empty for immediate start.',
      options: {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        timeStep: 15,
      },
      hidden: ({document}) => !document?.onSale,
      group: 'basic',
    }),
    defineField({
      name: 'saleEndDate',
      type: 'datetime',
      title: 'Sale End Date',
      description: 'When the sale ends. Leave empty for no end date.',
      validation: (Rule) =>
        Rule.custom((endDate, context) => {
          const startDate = (context.document as any)?.saleStartDate
          if (endDate && startDate && new Date(endDate) <= new Date(startDate)) {
            return 'End date must be after start date'
          }
          return true
        }),
      options: {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        timeStep: 15,
      },
      hidden: ({document}) => !document?.onSale,
      group: 'basic',
    }),
    defineField({
      name: 'saleLabel',
      type: 'string',
      title: 'Sale Badge Label',
      description: "Custom badge text (e.g., 'Black Friday', 'Cyber Monday', 'Clearance')",
      options: {
        list: [
          {title: 'Sale', value: 'sale'},
          {title: 'Black Friday', value: 'black-friday'},
          {title: 'Cyber Monday', value: 'cyber-monday'},
          {title: 'Clearance', value: 'clearance'},
          {title: 'Limited Time', value: 'limited-time'},
          {title: 'Hot Deal', value: 'hot-deal'},
        ],
        layout: 'dropdown',
      },
      initialValue: 'sale',
      hidden: ({document}) => !document?.onSale,
      group: 'basic',
    }),
    defineField({
      name: 'priceCurrency',
      title: 'Currency',
      type: 'string',
      description: 'ISO 4217 currency code, defaults to USD.',
      initialValue: 'USD',
      group: 'basic',
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [
        {
          type: 'image',
          fields: [
            {
              name: 'alt',
              title: 'Alt Text',
              type: 'reference',
              to: [{type: 'altText'}],
              description:
                'Select a reusable alt text variation from the global list. Legacy string values are imported automatically.',
              components: {
                input: ProductImageAltReferenceInput,
              },
            },
          ],
          options: {hotspot: true},
        },
      ],
      description:
        'First image is the main hero photo. Add 3-5 shots that show angles, install context, or branding.',
      validation: (Rule) =>
        Rule.required().min(1).error('Product needs at least one image before it can go live.'),
      group: 'basic',
    }),
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
      description: '1-2 compelling sentences shown on product cards and checkout summaries.',
      validation: (Rule) =>
        Rule.required()
          .min(1)
          .max(2)
          .error('Short description should be one or two short sentences.'),
      group: 'basic',
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
      description: 'The full story, install guidance, and FAQs that help customers say yes.',
      validation: (Rule) => Rule.required().min(1).error('Full description is required.'),
      group: 'basic',
    }),
    defineField({
      name: 'category',
      title: 'Categories',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'category'}]}],
      description: 'At least one category so the product appears in the right storefront sections.',
      validation: (Rule) =>
        Rule.required().min(1).error('Select at least one category for storefront filtering.'),
      group: 'basic',
    }),
    defineField({
      name: 'tags',
      title: 'Internal Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
      description: 'Quick search helpers or marketing campaigns. Not customer-facing.',
      group: 'details',
    }),
    defineField({
      name: 'featured',
      title: 'Featured Product',
      type: 'boolean',
      description: 'Show in featured carousels on the home page and landing pages.',
      initialValue: false,
      group: 'details',
    }),
    defineField({
      name: 'promotionTagline',
      title: 'Promotion Tagline',
      type: 'string',
      description: 'Optional badge such as “Track Tested” or “Limited Batch”.',
      group: 'details',
    }),
    defineField({
      name: 'keyFeatures',
      title: 'Key Features',
      type: 'array',
      of: [{type: 'collapsibleFeature'}],
      description: 'Highlight the three most important benefits with icons.',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'importantNotes',
      title: 'Important Notes / Warnings',
      type: 'array',
      of: [{type: 'block'}],
      description:
        'Call out fitment requirements, tuning needs, or anything that protects the customer experience.',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'specifications',
      title: 'Technical Specifications',
      type: 'array',
      of: [{type: 'specItem'}],
      description: 'Material, finish, torque specs, or other data customers need.',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'attributes',
      title: 'Product Attributes',
      type: 'array',
      of: [{type: 'attribute'}],
      description: 'Additional attributes (Color: Black, Finish: Anodized, etc.).',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'includedInKit',
      title: "What's Included",
      type: 'array',
      of: [{type: 'kitItem'}],
      description: 'List every piece inside the box or installation package.',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'faq',
      title: 'Product FAQ',
      type: 'array',
      options: {collapsible: true, collapsed: true} as any,
      of: [
        {
          type: 'object',
          name: 'faqEntry',
          fields: [
            {name: 'question', type: 'string', title: 'Question'},
            {name: 'answer', type: 'text', title: 'Answer', rows: 3},
          ],
          preview: {
            select: {title: 'question', subtitle: 'answer'},
            prepare({title, subtitle}) {
              return {
                title: title || 'Untitled question',
                subtitle: subtitle || 'No answer provided',
              }
            },
          },
        },
      ],
      description: 'Answer common objections up front.',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'mediaAssets',
      title: 'Additional Media',
      type: 'array',
      of: [{type: 'mediaItem'}],
      description: 'Videos, install guides, dyno sheets, or PDF downloads.',
      fieldset: 'productDetails',
      group: 'details',
    }),
    defineField({
      name: 'variantStrategy',
      title: 'Variant Structure',
      type: 'string',
      description: 'Use “Requires options” when customers must choose size, finish, or platform.',
      options: {
        layout: 'radio',
        list: [
          {title: 'Single item (no variants)', value: 'simple'},
          {title: 'Requires options before checkout', value: 'variable'},
        ],
      },
      initialValue: 'simple',
      fieldset: 'optionsAndVariants',
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
      hidden: ({document, parent}) => {
        if (!isPhysicalOrBundle({document, parent})) return true
        const variantType = document?.variantStrategy || parent?.variantStrategy || 'simple'
        return variantType !== 'variable'
      },
      validation: (Rule) =>
        Rule.custom((options, context) => {
          const doc = context?.document as any
          const variantType = doc?.variantStrategy || 'simple'
          const type = doc?.productType || 'physical'
          if (type !== 'physical' && type !== 'bundle') return true
          if (variantType !== 'variable') return true
          if (!Array.isArray(options) || options.length === 0) {
            return 'Add at least one option so the customer can make a selection.'
          }
          const anyOptional = options.some((opt: any) => opt && opt.required === false)
          if (anyOptional) {
            return 'All defined product options must be required for customers to choose before checkout.'
          }
          return true
        }),
      fieldset: 'optionsAndVariants',
      group: 'options',
    }),
    defineField({
      name: 'addOns',
      title: 'Add-Ons & Optional Bundles',
      type: 'array',
      description: 'Upsell extras or link to products that can be bundled with this item.',
      of: [{type: 'addOn'}, {type: 'productAddOn'}],
      fieldset: 'optionsAndVariants',
      group: 'options',
    }),
    defineField({
      name: 'customPaint',
      title: 'Custom Paint Options',
      type: 'customPaint',
      description: 'Offer optional powder coating with paint code collection.',
      fieldset: 'optionsAndVariants',
      group: 'options',
    }),
    defineField({
      name: 'paymentCaptureStrategy',
      title: 'Payment Capture Strategy',
      type: 'string',
      description: "When should we charge the customer's card?",
      options: {
        layout: 'radio',
        list: [
          {
            title: 'Auto-Capture – Charge Immediately (in-stock items)',
            value: 'auto',
          },
          {
            title: 'Manual Capture – Authorize Now, Charge When Ready to Ship',
            value: 'manual',
          },
        ],
      },
      initialValue: (context) => {
        const doc = (context as any)?.document || {}
        const productType = doc?.productType
        const handlingTime = Number(doc?.shippingConfig?.handlingTime || 0)
        const hasCustomPaint = Boolean(doc?.customPaint?.enabled)
        const isMailIn = doc?.serviceDeliveryModel === 'mail-in-service'
        if (hasCustomPaint || handlingTime > 3 || isMailIn) return 'manual'
        if (productType === 'service') return 'manual'
        return 'auto'
      },
      group: 'advanced',
    }),
    defineField({
      name: 'serviceDuration',
      title: 'Service Duration',
      type: 'string',
      description: 'Estimated appointment or labor time (e.g., "3 hours" or "Full day").',
      hidden: ({document, parent}) => !isServiceProduct({document, parent}),
      fieldset: 'serviceDetails',
      group: 'service',
    }),
    defineField({
      name: 'serviceLocation',
      title: 'Service Location',
      type: 'string',
      description: 'Where the work happens (FAS shop, remote, customer location, etc.).',
      hidden: ({document, parent}) => !isServiceProduct({document, parent}),
      fieldset: 'serviceDetails',
      group: 'service',
    }),
    defineField({
      name: 'serviceDeliverables',
      title: "What's Included in the Service",
      type: 'array',
      of: [{type: 'string'}],
      description: 'List the labor steps or deliverables so customers know what is covered.',
      hidden: ({document, parent}) => !isServiceProduct({document, parent}),
      fieldset: 'serviceDetails',
      group: 'service',
    }),
    defineField({
      name: 'serviceLaborNotes',
      title: 'Labor & Equipment Notes',
      type: 'text',
      rows: 3,
      description: 'Internal notes about tools, lifts, or staffing required.',
      hidden: ({document, parent}) => !isServiceProduct({document, parent}),
      fieldset: 'serviceDetails',
      group: 'service',
    }),
    defineField({
      name: 'serviceSchedulingNotes',
      title: 'Scheduling Guidance',
      type: 'text',
      rows: 3,
      description: 'Add lead time, days of the week, or customer prep instructions.',
      hidden: ({document, parent}) => !isServiceProduct({document, parent}),
      fieldset: 'serviceDetails',
      group: 'service',
    }),
    defineField({
      name: 'serviceDeliveryModel',
      title: 'Service Delivery Model',
      type: 'string',
      description: 'Choose how this service is delivered.',
      hidden: ({document, parent}) => resolveProductType({document, parent}) !== 'service',
      initialValue: 'install-only',
      options: {
        list: [
          {title: '📬 Mail-In Service', value: 'mail-in-service'},
          {title: '🔧 Install-Only', value: 'install-only'},
          {title: '📦 Hybrid', value: 'hybrid'},
        ],
      },
      validation: (Rule) =>
        Rule.custom((value, context: any) => {
          const productType = resolveProductType(context as VisibilityContext)
          if (productType !== 'service') return true
          if (!value) return 'Select how this service is delivered'
          return true
        }),
      fieldset: 'serviceDetails',
      group: 'service',
    }),
    defineField({
      name: 'mailInServiceDetails',
      title: 'Mail-In Service Details',
      type: 'object',
      description: 'Only visible when the delivery model is mail-in.',
      hidden: ({document}) => document?.serviceDeliveryModel !== 'mail-in-service',
      validation: (Rule) =>
        Rule.custom((value, context: any) => {
          const deliveryModel = (context.document as any)?.serviceDeliveryModel
          if (deliveryModel !== 'mail-in-service') return true
          if (!value) return 'Provide mail-in service details'
          if (!value.turnaroundTime) return 'Turnaround time is required for mail-in services'
          return true
        }),
      fieldset: 'serviceDetails',
      group: 'service',
      fields: [
        defineField({
          name: 'turnaroundTime',
          title: 'Turnaround Time',
          type: 'string',
          description: 'E.g., 3-5 business days, 7-10 business days.',
          validation: (Rule) =>
            Rule.custom((value, context: any) => {
              const deliveryModel = (context.document as any)?.serviceDeliveryModel
              if (deliveryModel !== 'mail-in-service') return true
              return value ? true : 'Required for mail-in services'
            }),
        }),
        defineField({
          name: 'returnShippingIncluded',
          title: 'Return Shipping Included',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'shippingInstructions',
          title: 'Customer Shipping Instructions',
          type: 'text',
          rows: 4,
          description: 'Packaging and shipping guidance for the customer.',
        }),
        defineField({
          name: 'componentWeight',
          title: 'Component Weight (lbs)',
          type: 'number',
          description: 'Weight of the component the customer ships to FAS.',
        }),
        defineField({
          name: 'recommendedPackaging',
          title: 'Recommended Packaging',
          type: 'text',
          rows: 3,
        }),
        defineField({
          name: 'insuranceValue',
          title: 'Recommended Insurance Value',
          type: 'number',
          description: 'Suggested declared value for customer shipping.',
        }),
      ],
    }),
    defineField({
      name: 'bundleComponents',
      title: 'Bundle Components',
      type: 'array',
      description: 'Reference each product that ships in this bundle or package.',
      hidden: ({document, parent}) => !isBundleProduct({document, parent}),
      of: [
        {
          type: 'object',
          name: 'bundleComponent',
          fields: [
            {
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{type: 'product'}],
              description: 'Link to the product that is included in this bundle.',
            },
            {
              name: 'title',
              title: 'Override Title',
              type: 'string',
              description:
                'Optional label shown to customers instead of the referenced product name.',
            },
            {
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
              initialValue: 1,
              validation: (Rule) => Rule.min(1),
            },
            {
              name: 'notes',
              title: 'Notes',
              type: 'text',
              rows: 2,
              description: 'Clarify compatibility, install order, or packaging tips.',
            },
          ],
          preview: {
            select: {
              title: 'title',
              productTitle: 'product.title',
              quantity: 'quantity',
            },
            prepare({title, productTitle, quantity}) {
              const label = title || productTitle || 'Bundle component'
              const qty = typeof quantity === 'number' && quantity > 1 ? `x${quantity}` : ''
              return {
                title: label,
                subtitle: qty,
              }
            },
          },
        },
      ],
      fieldset: 'bundleContents',
      group: 'bundle',
    }),
    defineField({
      name: 'shippingConfig',
      type: 'object',
      title: 'Shipping Configuration',
      description: 'Physical attributes for shipping rate calculation',
      fieldset: 'productDetails',
      group: 'shipping',
      options: {
        collapsible: true,
        collapsed: false,
      },
      initialValue: async (context: VisibilityContext & {document?: any}) => {
        const doc = (context as any)?.document || {}
        const service = resolveProductType(context) === 'service'
        const deliveryModel = doc?.serviceDeliveryModel
        const mailInOrHybrid =
          service && (deliveryModel === 'mail-in-service' || deliveryModel === 'hybrid')
        const installOnly = service && deliveryModel === 'install-only'
        const legacyWeight = normalizeShippingNumber(doc?.shippingWeight)
        const legacyDimensions = parseShippingDimensions(doc?.boxDimensions)
        const legacyClass = normalizeShippingClass(doc?.shippingClass) || undefined

        const requiresShipping =
          doc?.shippingConfig?.requiresShipping !== undefined
            ? doc.shippingConfig.requiresShipping
            : installOnly
              ? false
              : service
                ? mailInOrHybrid
                  ? true
                  : false
                : true

        const weight =
          doc?.shippingConfig?.weight !== undefined && doc.shippingConfig.weight !== null
            ? normalizeShippingNumber(doc.shippingConfig.weight)
            : legacyWeight

        const dimensions =
          doc?.shippingConfig?.dimensions ??
          (legacyDimensions
            ? {
                length: legacyDimensions.length,
                width: legacyDimensions.width,
                height: legacyDimensions.height,
              }
            : undefined)

        const shippingClass =
          normalizeShippingClass(doc?.shippingConfig?.shippingClass) ||
          legacyClass ||
          (installOnly ? 'install_only' : 'standard')

        const handlingTime =
          normalizeShippingNumber(doc?.shippingConfig?.handlingTime) ??
          normalizeShippingNumber(doc?.handlingTime) ??
          2

        const separateShipment =
          typeof doc?.shippingConfig?.separateShipment === 'boolean'
            ? doc.shippingConfig.separateShipment
            : typeof doc?.shipsAlone === 'boolean'
              ? doc.shipsAlone
              : false

        const freeShippingEligible =
          typeof doc?.shippingConfig?.freeShippingEligible === 'boolean'
            ? doc.shippingConfig.freeShippingEligible
            : true

        const callForShippingQuote =
          typeof doc?.shippingConfig?.callForShippingQuote === 'boolean'
            ? doc.shippingConfig.callForShippingQuote
            : false

        return {
          requiresShipping,
          shippingClass,
          handlingTime,
          freeShippingEligible,
          separateShipment,
          callForShippingQuote,
          weight: weight ?? undefined,
          dimensions,
        }
      },
      fields: [
        {
          name: 'requiresShipping',
          type: 'boolean',
          title: 'Requires Shipping',
          description: 'Disable for services, installations, or digital products',
          initialValue: (context: VisibilityContext) => {
            const productType = resolveProductType(context)
            if (productType !== 'service') return true
            const deliveryModel =
              (context as any)?.document?.serviceDeliveryModel ||
              (context as any)?.parent?.serviceDeliveryModel
            if (deliveryModel === 'mail-in-service' || deliveryModel === 'hybrid') return true
            return false
          },
          components: {input: RequiresShippingField},
          validation: (Rule) =>
            Rule.required().custom((value, context: any) => {
              const productType = resolveProductType(context as VisibilityContext)
              const deliveryModel = (context.document as any)?.serviceDeliveryModel
              if (productType === 'service') {
                if (deliveryModel === 'install-only' && value !== false) {
                  return 'Install-only services should have shipping disabled.'
                }
                if (
                  (deliveryModel === 'mail-in-service' || deliveryModel === 'hybrid') &&
                  value !== true
                ) {
                  return 'Shipping should be enabled for mail-in or hybrid services.'
                }
              }
              if (typeof value !== 'boolean') {
                return 'Specify whether this product requires shipping.'
              }
              return true
            }),
        },
        {
          name: 'callForShippingQuote',
          type: 'boolean',
          title: 'Call for Shipping Quote',
          description: "Don't charge shipping upfront; collect a manual quote instead.",
          hidden: (context: ShippingVisibilityContext) =>
            !shouldRequireShippingDetails(context as ShippingVisibilityContext),
          initialValue: false,
        },
        {
          name: 'weight',
          type: 'number',
          title: 'Weight (lbs)',
          description: 'Product weight for shipping calculation',
          hidden: (context: ShippingVisibilityContext) =>
            !shouldRequireShippingDetails(context as ShippingVisibilityContext),
          validation: (Rule) =>
            Rule.custom((value, context: any) => {
              const shippingQuote = isCallForShippingQuote(context as ShippingVisibilityContext)
              if (!shouldRequireShippingDetails(context as ShippingVisibilityContext)) return true
              if (typeof value !== 'number') {
                if (shippingQuote) return true
                return 'Weight is required when shipping is enabled.'
              }
              if (value < 0) {
                return 'Weight cannot be negative.'
              }
              return true
            }).precision(2),
        },
        {
          name: 'dimensions',
          type: 'object',
          title: 'Package Dimensions',
          description: 'Typical box size for this product',
          hidden: (context: ShippingVisibilityContext) =>
            !shouldRequireShippingDetails(context as ShippingVisibilityContext),
          validation: (Rule) =>
            Rule.custom((value, context: any) => {
              const shippingQuote = isCallForShippingQuote(context as ShippingVisibilityContext)
              if (!shouldRequireShippingDetails(context as ShippingVisibilityContext)) return true
              if (!value)
                return shippingQuote ? true : 'Dimensions are required when shipping is enabled.'
              const {length, width, height} = value as Record<string, number>
              if (
                typeof length !== 'number' ||
                typeof width !== 'number' ||
                typeof height !== 'number'
              ) {
                if (shippingQuote) return true
                return 'Enter length, width, and height in inches.'
              }
              if (length < 0 || width < 0 || height < 0) {
                return 'Dimensions must be zero or greater.'
              }
              return true
            }),
          fields: [
            {
              name: 'length',
              type: 'number',
              title: 'Length (inches)',
              hidden: (context: ShippingVisibilityContext) =>
                !shouldRequireShippingDetails(context as ShippingVisibilityContext),
              validation: (Rule) =>
                Rule.custom((value, context: any) => {
                  const shippingQuote = isCallForShippingQuote(context as ShippingVisibilityContext)
                  if (!shouldRequireShippingDetails(context as ShippingVisibilityContext))
                    return true
                  if (typeof value !== 'number') {
                    if (shippingQuote) return true
                    return 'Length is required when shipping is enabled.'
                  }
                  if (value < 0) return 'Length cannot be negative.'
                  return true
                }).precision(2),
            },
            {
              name: 'width',
              type: 'number',
              title: 'Width (inches)',
              hidden: (context: ShippingVisibilityContext) =>
                !shouldRequireShippingDetails(context as ShippingVisibilityContext),
              validation: (Rule) =>
                Rule.custom((value, context: any) => {
                  const shippingQuote = isCallForShippingQuote(context as ShippingVisibilityContext)
                  if (!shouldRequireShippingDetails(context as ShippingVisibilityContext))
                    return true
                  if (typeof value !== 'number') {
                    if (shippingQuote) return true
                    return 'Width is required when shipping is enabled.'
                  }
                  if (value < 0) return 'Width cannot be negative.'
                  return true
                }).precision(2),
            },
            {
              name: 'height',
              type: 'number',
              title: 'Height (inches)',
              hidden: (context: ShippingVisibilityContext) =>
                !shouldRequireShippingDetails(context as ShippingVisibilityContext),
              validation: (Rule) =>
                Rule.custom((value, context: any) => {
                  const shippingQuote = isCallForShippingQuote(context as ShippingVisibilityContext)
                  if (!shouldRequireShippingDetails(context as ShippingVisibilityContext))
                    return true
                  if (typeof value !== 'number') {
                    if (shippingQuote) return true
                    return 'Height is required when shipping is enabled.'
                  }
                  if (value < 0) return 'Height cannot be negative.'
                  return true
                }).precision(2),
            },
          ],
        },
        {
          name: 'shippingClass',
          type: 'string',
          title: 'Shipping Class',
          description: 'Special handling requirements',
          initialValue: (context: VisibilityContext) =>
            resolveProductType(context) === 'service' ? 'install_only' : 'standard',
          options: {
            list: [
              {title: 'Standard', value: 'standard'},
              {title: 'Oversized', value: 'oversized'},
              {title: 'Fragile - Extra Packaging', value: 'fragile'},
              {title: 'Hazmat', value: 'hazmat'},
              {title: 'Install Only (No Shipping)', value: 'install_only'},
            ],
          },
          components: {input: ShippingClassField},
          validation: (Rule) =>
            Rule.custom((value: unknown) => {
              if (!value) return true
              const normalized = normalizeShippingClass(
                typeof value === 'string' ? value : String(value || ''),
              )
              if (normalized && SHIPPING_CLASS_VALUES.includes(normalized)) return true
              return 'Select a valid shipping class.'
            }),
        },
        {
          name: 'handlingTime',
          type: 'number',
          title: 'Handling Time (business days)',
          description: 'Days needed to prepare shipment after order',
          hidden: (context: ShippingVisibilityContext) =>
            !shouldRequireShippingDetails(context as ShippingVisibilityContext),
          validation: (Rule) =>
            Rule.custom((value, context: any) => {
              if (!shouldRequireShippingDetails(context as ShippingVisibilityContext)) return true
              if (typeof value !== 'number') return true
              if (value < 0) return 'Handling time cannot be negative.'
              return true
            }).integer(),
          initialValue: 1,
        },
        {
          name: 'freeShippingEligible',
          type: 'boolean',
          title: 'Free Shipping Eligible',
          description: 'Can this product qualify for free shipping promotions?',
          hidden: (context: ShippingVisibilityContext) =>
            !shouldRequireShippingDetails(context as ShippingVisibilityContext),
          initialValue: true,
        },
        {
          name: 'separateShipment',
          type: 'boolean',
          title: 'Ships Separately',
          description: 'Must ship alone (oversized, hazmat, etc.)',
          hidden: (context: ShippingVisibilityContext) =>
            !shouldRequireShippingDetails(context as ShippingVisibilityContext),
          initialValue: false,
        },
      ],
    }),
    defineField({
      name: 'shippingPreview',
      title: 'Shipping Cost Preview',
      type: 'object',
      fields: [
        {
          name: 'placeholder',
          type: 'string',
          hidden: true,
          readOnly: true,
        },
      ],
      readOnly: true,
      components: {input: ShippingCalculatorPreview},
      hidden: ({document, parent}) => !isPhysicalOrBundle({document, parent}),
      fieldset: 'shippingDetails',
      group: 'shipping',
    }),
    defineField({
      name: 'specialShippingNotes',
      title: 'Special Shipping Instructions',
      type: 'text',
      rows: 4,
      description: 'Internal or customer-facing notes that must accompany this shipment.',
      hidden: ({document, parent}) => !isPhysicalOrBundle({document, parent}),
      fieldset: 'shippingDetails',
      group: 'shipping',
    }),
    defineField({
      name: 'coreRequired',
      title: 'Core Required',
      type: 'boolean',
      description: 'Indicates if the product requires a customer core return or exchange.',
      hidden: ({document, parent}) => !isPhysicalOrBundle({document, parent}),
      fieldset: 'shippingDetails',
      group: 'shipping',
    }),
    defineField({
      name: 'trackInventory',
      title: 'Track Inventory',
      type: 'boolean',
      description: 'Disable only for made-to-order items. When off, quantity is ignored.',
      initialValue: true,
      fieldset: 'inventorySettings',
      group: 'inventory',
    }),
    defineField({
      name: 'manualInventoryCount',
      title: 'Quantity on Hand',
      type: 'number',
      description: 'Only required when inventory tracking is enabled.',
      hidden: ({document, parent}) => {
        const track = document?.trackInventory ?? parent?.trackInventory ?? true
        return track === false
      },
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const track = (context.document as any)?.trackInventory
          if (track === false) return true
          if (typeof value !== 'number' || value < 0) {
            return 'Enter the on-hand quantity or disable inventory tracking.'
          }
          return true
        }),
      fieldset: 'inventorySettings',
      group: 'inventory',
    }),
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
      fieldset: 'inventorySettings',
      group: 'inventory',
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
      fieldset: 'inventorySettings',
      group: 'inventory',
    }),
    defineField({
      name: 'compatibleVehicles',
      title: 'Compatible Vehicles',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'vehicleModel'}]}],
      description: 'Link to compatible vehicle models to power fitment search.',
      hidden: ({document, parent}) => isServiceProduct({document, parent}),
      fieldset: 'compatibilityDetails',
      group: 'compatibility',
    }),
    defineField({
      name: 'tune',
      title: 'Required Tune',
      type: 'reference',
      to: [{type: 'tune'}],
      description: 'Link to a tune document if installation requires it.',
      hidden: ({document, parent}) => isServiceProduct({document, parent}),
      fieldset: 'compatibilityDetails',
      group: 'compatibility',
    }),
    defineField({
      name: 'averageHorsepower',
      title: 'Average HP Gain',
      type: 'number',
      description: 'Expected horsepower increase for marketing and comparison tables.',
      hidden: ({document, parent}) => isServiceProduct({document, parent}),
      fieldset: 'compatibilityDetails',
      group: 'compatibility',
    }),
    defineField({
      name: 'metaTitle',
      title: 'Meta Title',
      type: 'string',
      description: 'This appears in Google search results. Include your focus keyword.',
      components: {input: SeoCharacterCountInput},
      validation: (Rule) =>
        Rule.required()
          .max(60)
          .error('Meta title is required and should stay under 60 characters.'),
      fieldset: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Description',
      type: 'text',
      rows: 3,
      description:
        'Convince searchers to click. Include benefits and keywords (max 160 characters).',
      components: {input: SeoCharacterCountInput},
      validation: (Rule) =>
        Rule.required().max(160).error('Missing SEO description - product may not rank well.'),
      fieldset: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'focusKeyword',
      title: 'Focus Keyword',
      type: 'string',
      description: 'Main search term you want to rank for.',
      components: {input: FocusKeywordInput},
      fieldset: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'marketingInsightsPanel',
      title: 'Marketing Insights',
      type: 'object',
      readOnly: true,
      description: 'Channel performance for paid orders attributed to this product.',
      components: {input: ProductMarketingInsights},
      fields: [{name: 'placeholder', type: 'string', hidden: true}],
      fieldset: 'seo',
      group: 'seo',
      hidden: ({document}) => !document?._id,
    }),
    defineField({
      name: 'socialImage',
      title: 'Social Share Image',
      type: 'image',
      options: {hotspot: true},
      fields: [{name: 'alt', title: 'Alt Text', type: 'string'}],
      description: 'Custom 1200×630 image for social links.',
      fieldset: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'canonicalUrl',
      title: 'Canonical URL',
      type: 'url',
      description:
        'Auto-filled from the product slug; override only when a custom canonical is required.',
      components: {input: CanonicalUrlField},
      fieldset: 'seo',
      group: 'seo',
    }),
    defineField({
      name: 'noindex',
      title: 'Hide from Search Engines',
      type: 'boolean',
      initialValue: false,
      description: 'Enable only for campaigns or duplicates that should not be indexed.',
      fieldset: 'seoAdvanced',
      group: 'seo',
    }),
    defineField({
      name: 'structuredDataOverrides',
      title: 'Structured Data Overrides',
      type: 'text',
      rows: 6,
      description: 'Optional raw JSON that will be merged with the generated Product JSON-LD.',
      fieldset: 'seoAdvanced',
      group: 'seo',
    }),
    defineField({
      name: 'structuredDataPreview',
      title: 'Structured Data Preview',
      type: 'text',
      readOnly: true,
      components: {
        input: ProductJsonLdPreview,
      },
      description: 'Auto-generated JSON-LD snippet based on the fields above.',
      fieldset: 'seoAdvanced',
      group: 'seo',
    }),
    defineField({
      name: 'stripeProductId',
      title: 'Stripe Product ID',
      type: 'string',
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripeDefaultPriceId',
      title: 'Stripe Default Price ID',
      type: 'string',
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripePriceId',
      title: 'Stripe Primary Price ID',
      type: 'string',
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripeActive',
      title: 'Stripe Active Status',
      type: 'boolean',
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripeUpdatedAt',
      title: 'Stripe Updated At',
      type: 'datetime',
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Last Synced with Stripe',
      type: 'datetime',
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripePrices',
      title: 'Stripe Price History',
      type: 'array',
      of: [{type: 'stripePriceSnapshot'}],
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'stripeMetadata',
      title: 'Stripe Metadata',
      type: 'array',
      of: [{type: 'stripeMetadataEntry'}],
      readOnly: true,
      fieldset: 'stripe',
      group: 'stripe',
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description: 'Manually curated related products (auto-computed by default).',
      group: 'advanced',
    }),
    defineField({
      name: 'upsellProducts',
      title: 'Upsell Products',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description: 'Premium alternatives to suggest.',
      group: 'advanced',
    }),
    defineField({
      name: 'filters',
      title: 'Filter Tags',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'filterTag'}]}],
      description: 'Tags used for storefront filtering.',
      group: 'advanced',
    }),
    defineField({
      name: 'brand',
      title: 'Brand / Manufacturer',
      type: 'string',
      description: 'Displayed in structured data and Google Merchant Center feeds.',
      initialValue: 'FAS Motorsports',
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'gtin',
      title: 'GTIN (UPC/EAN)',
      type: 'string',
      description: 'Product barcode for Google Shopping. Recommended but not required.',
      fieldset: 'merchant',
      group: 'advanced',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const status = context?.document?.status
          const productType =
            typeof context?.document?.productType === 'string'
              ? context.document.productType.toLowerCase()
              : 'physical'
          if (!value && status === 'active' && productType !== 'service') {
            return '⚠️ GTIN recommended for Google Shopping (not required)'
          }
          return true
        }).warning(),
    }),
    defineField({
      name: 'mpn',
      title: 'MPN',
      type: 'string',
      description: 'Auto-generated on product creation.',
      initialValue: async ({getClient}) => {
        const client = getClient?.({apiVersion: PRODUCT_API_VERSION})
        if (!client) return ''
        try {
          const result = await generateInitialMpn(client)
          return result?.mpn || ''
        } catch (error) {
          console.warn('Failed to auto-generate initial MPN', error)
          return ''
        }
      },
      readOnly: true,
      fieldset: 'merchant',
      group: 'advanced',
      validation: (Rule) => merchantFieldWarning(Rule, '⚠️ Add MPN for Google Shopping'),
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
      validation: (Rule) => merchantFieldWarning(Rule, '⚠️ Select Google Product Category'),
    }),
    defineField({
      name: 'shippingLabel',
      title: 'Merchant Shipping Label',
      type: 'string',
      description:
        'Maps to Google Merchant Center shipping_label. Use for Install Only vs. Performance Parts.',
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
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'merchantCenterStatus',
      title: 'Merchant Center Status',
      type: 'object',
      readOnly: true,
      options: {collapsible: true, collapsed: false},
      fields: [
        {name: 'isApproved', type: 'boolean', title: 'Approved for Shopping'},
        {name: 'needsGtin', type: 'boolean', title: 'Missing GTIN'},
        {name: 'needsMpn', type: 'boolean', title: 'Missing MPN'},
        {name: 'needsCategory', type: 'boolean', title: 'Missing Google Category'},
        defineField({
          name: 'issues',
          title: 'Issues',
          type: 'array',
          of: [
            defineField({
              name: 'issue',
              type: 'object',
              fields: [
                {name: 'code', type: 'string'},
                {name: 'description', type: 'string'},
                {name: 'severity', type: 'string'},
              ],
            }),
          ],
        }),
        {name: 'lastSynced', type: 'datetime', title: 'Last Synced'},
      ],
      fieldset: 'merchant',
      group: 'advanced',
    }),
    defineField({
      name: 'variationOptions',
      title: 'Variation Options (legacy)',
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
    defineField({
      name: 'analytics',
      type: 'object',
      title: 'Analytics & Performance',
      description: 'Product performance metrics (auto-updated)',
      readOnly: true,
      options: {
        collapsible: true,
        collapsed: true,
      },
      group: 'advanced',
      fields: [
        defineField({
          name: 'views',
          type: 'object',
          title: 'Page Views',
          fields: [
            {
              name: 'total',
              type: 'number',
              title: 'Total Views',
              description: 'All-time page views',
              initialValue: 0,
            },
            {name: 'last7Days', type: 'number', title: 'Last 7 Days', initialValue: 0},
            {name: 'last30Days', type: 'number', title: 'Last 30 Days', initialValue: 0},
            {name: 'last90Days', type: 'number', title: 'Last 90 Days', initialValue: 0},
            {
              name: 'uniqueVisitors',
              type: 'number',
              title: 'Unique Visitors',
              description: 'Unique visitors (all-time)',
              initialValue: 0,
            },
          ],
        }),
        defineField({
          name: 'sales',
          type: 'object',
          title: 'Sales Performance',
          fields: [
            {
              name: 'totalOrders',
              type: 'number',
              title: 'Total Orders',
              description: 'Number of orders containing this product',
              initialValue: 0,
            },
            {
              name: 'totalQuantitySold',
              type: 'number',
              title: 'Total Quantity Sold',
              description: 'Total units sold',
              initialValue: 0,
            },
            {
              name: 'totalRevenue',
              type: 'number',
              title: 'Total Revenue',
              description: 'Total revenue generated (USD)',
              initialValue: 0,
            },
            {
              name: 'averageOrderValue',
              type: 'number',
              title: 'Average Order Value',
              description: 'Average revenue per order',
            },
            {name: 'last7DaysSales', type: 'number', title: 'Sales (Last 7 Days)', initialValue: 0},
            {
              name: 'last30DaysSales',
              type: 'number',
              title: 'Sales (Last 30 Days)',
              initialValue: 0,
            },
            {
              name: 'last90DaysSales',
              type: 'number',
              title: 'Sales (Last 90 Days)',
              initialValue: 0,
            },
            {
              name: 'bestSellingRank',
              type: 'number',
              title: 'Best Seller Rank',
              description: 'Rank among all products (1 = best seller)',
            },
            {name: 'firstSaleDate', type: 'datetime', title: 'First Sale Date'},
            {name: 'lastSaleDate', type: 'datetime', title: 'Last Sale Date'},
          ],
        }),
        defineField({
          name: 'conversion',
          type: 'object',
          title: 'Conversion Metrics',
          fields: [
            {
              name: 'addToCartCount',
              type: 'number',
              title: 'Add to Cart Count',
              description: 'Times added to cart',
              initialValue: 0,
            },
            {
              name: 'addToCartRate',
              type: 'number',
              title: 'Add to Cart Rate (%)',
              description: 'Percentage of views that add to cart',
            },
            {
              name: 'purchaseConversionRate',
              type: 'number',
              title: 'Purchase Conversion Rate (%)',
              description: 'Percentage of views that result in purchase',
            },
            {
              name: 'cartAbandonmentRate',
              type: 'number',
              title: 'Cart Abandonment Rate (%)',
              description: 'Percentage of carts abandoned',
            },
            {
              name: 'wishlistCount',
              type: 'number',
              title: 'Wishlist Adds',
              description: 'Times added to wishlist',
              initialValue: 0,
            },
          ],
        }),
        defineField({
          name: 'engagement',
          type: 'object',
          title: 'Customer Engagement',
          fields: [
            {
              name: 'averageTimeOnPage',
              type: 'number',
              title: 'Avg Time on Page (seconds)',
              description: 'Average time spent viewing product',
            },
            {
              name: 'bounceRate',
              type: 'number',
              title: 'Bounce Rate (%)',
              description: 'Percentage of single-page sessions',
            },
            {
              name: 'shareCount',
              type: 'number',
              title: 'Social Shares',
              description: 'Times shared on social media',
              initialValue: 0,
            },
            {
              name: 'emailClicks',
              type: 'number',
              title: 'Email Clicks',
              description: 'Clicks from email campaigns',
              initialValue: 0,
            },
          ],
        }),
        defineField({
          name: 'ads',
          type: 'object',
          title: 'Google Ads Performance (Last 30 Days)',
          options: {collapsible: true, collapsed: true},
          fields: [
            {name: 'impressions', type: 'number', title: 'Impressions'},
            {name: 'clicks', type: 'number', title: 'Clicks'},
            {name: 'conversions', type: 'number', title: 'Conversions'},
            {name: 'adSpend', type: 'number', title: 'Ad Spend (USD)'},
            {name: 'revenue', type: 'number', title: 'Revenue (USD)'},
            {name: 'roas', type: 'number', title: 'ROAS (Return on Ad Spend)'},
            {name: 'ctr', type: 'number', title: 'CTR (%)'},
            {name: 'lastUpdated', type: 'datetime', title: 'Last Updated'},
          ],
        }),
        defineField({
          name: 'returns',
          type: 'object',
          title: 'Returns & Refunds',
          fields: [
            {
              name: 'returnCount',
              type: 'number',
              title: 'Return Count',
              description: 'Number of returns',
              initialValue: 0,
            },
            {
              name: 'returnRate',
              type: 'number',
              title: 'Return Rate (%)',
              description: 'Percentage of orders returned',
            },
            {
              name: 'refundAmount',
              type: 'number',
              title: 'Total Refunds',
              description: 'Total refund amount (USD)',
              initialValue: 0,
            },
            {
              name: 'topReturnReasons',
              type: 'array',
              title: 'Top Return Reasons',
              of: [
                defineField({
                  name: 'returnReason',
                  title: 'Return Reason',
                  type: 'object',
                  fields: [
                    {name: 'reason', type: 'string', title: 'Reason'},
                    {name: 'count', type: 'number', title: 'Count'},
                  ],
                }),
              ],
            },
          ],
        }),
        defineField({
          name: 'profitability',
          type: 'object',
          title: 'Profitability',
          fields: [
            {
              name: 'grossProfit',
              type: 'number',
              title: 'Gross Profit',
              description: 'Total revenue minus cost',
            },
            {
              name: 'grossMargin',
              type: 'number',
              title: 'Gross Margin (%)',
              description: 'Profit as percentage of revenue',
            },
            {
              name: 'averageProfitPerUnit',
              type: 'number',
              title: 'Avg Profit Per Unit',
            },
          ],
        }),
        defineField({
          name: 'trends',
          type: 'object',
          title: 'Trends',
          fields: [
            {
              name: 'velocityScore',
              type: 'number',
              title: 'Velocity Score',
              description: 'Sales momentum indicator (0-100)',
            },
            {
              name: 'trendDirection',
              type: 'string',
              title: 'Trend Direction',
              options: {
                list: [
                  {title: '📈 Trending Up', value: 'up'},
                  {title: '📊 Stable', value: 'stable'},
                  {title: '📉 Trending Down', value: 'down'},
                ],
              },
            },
            {
              name: 'seasonalityScore',
              type: 'number',
              title: 'Seasonality Score',
              description: 'Seasonal demand indicator',
            },
            {name: 'peakSalesMonth', type: 'string', title: 'Peak Sales Month'},
          ],
        }),
        defineField({
          name: 'lastUpdated',
          type: 'datetime',
          title: 'Last Analytics Update',
          description: 'When analytics were last calculated',
        }),
      ],
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
