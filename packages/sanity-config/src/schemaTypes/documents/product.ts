import LegacyContentStatusInput from '../../components/inputs/LegacyContentStatusInput'
import {defineArrayMember, defineField, defineType} from 'sanity'

const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  description: 'Content enrichment for Medusa products. Medusa owns pricing, inventory, checkout, and shipping rules.',
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'compatibility', title: 'Compatibility'},
    {name: 'seo', title: 'SEO'},
    {name: 'integration', title: 'Medusa Bridge'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', validation: (Rule) => Rule.required(), group: 'content'}),
    defineField({name: 'displayTitle', type: 'string', group: 'content'}),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'displayTitle', maxLength: 96},
      validation: (Rule) => Rule.required(),
      group: 'content',
    }),
    defineField({
      name: 'contentStatus',
      title: 'Content Status',
      type: 'string',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'Review', value: 'review'},
          {title: 'Published', value: 'published'},
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      components: {input: LegacyContentStatusInput},
      group: 'content',
    }),
    defineField({
      name: 'shortDescription',
      type: 'portableTextSimple',
      group: 'content',
    }),
    defineField({name: 'description', type: 'portableText', group: 'content'}),
    defineField({name: 'keyFeatures', type: 'array', of: [{type: 'string'}], group: 'content'}),
    defineField({name: 'importantNotes', type: 'portableTextSimple', group: 'content'}),
    defineField({name: 'specifications', type: 'array', of: [{type: 'specItem'}], group: 'content'}),
    defineField({name: 'attributes', type: 'array', of: [{type: 'attribute'}], group: 'content'}),
    defineField({name: 'includedInKit', type: 'array', of: [{type: 'kitItem'}], group: 'content'}),
    defineField({name: 'mediaAssets', type: 'array', of: [{type: 'mediaItem'}], group: 'content'}),
    defineField({
      name: 'images',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          options: {hotspot: true},
          fields: [{name: 'altTextReference', type: 'reference', to: [{type: 'altText'}]}],
        }),
      ],
      group: 'content',
    }),
    defineField({
      name: 'options',
      type: 'array',
      group: 'content',
      of: [
        {type: 'customProductOptionColor'},
        {type: 'customProductOptionSize'},
        {type: 'customProductOptionCustom'},
      ],
    }),
    defineField({name: 'addOns', type: 'array', of: [{type: 'addOn'}], group: 'content'}),
    defineField({name: 'bundleAddOns', type: 'array', of: [{type: 'productAddOn'}], group: 'content'}),
    defineField({
      name: 'category',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'category'}]})],
      group: 'content',
    }),
    defineField({
      name: 'filters',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'filterTag'}]})],
      group: 'content',
    }),
    defineField({name: 'customPaint', type: 'customPaint', group: 'content'}),
    defineField({name: 'compatibleVehicles', type: 'array', of: [{type: 'reference', to: [{type: 'vehicleModel'}]}], group: 'compatibility'}),
    defineField({name: 'tunes', type: 'array', of: [{type: 'reference', to: [{type: 'tune'}]}], group: 'compatibility'}),
    defineField({name: 'featured', type: 'boolean', initialValue: false, group: 'content'}),
    defineField({name: 'promotionTagline', type: 'string', group: 'content'}),
    defineField({name: 'metaTitle', type: 'string', group: 'seo'}),
    defineField({name: 'metaDescription', type: 'text', rows: 3, group: 'seo'}),
    defineField({name: 'focusKeyword', type: 'string', group: 'seo'}),
    defineField({name: 'socialImage', type: 'image', options: {hotspot: true}, group: 'seo'}),
    defineField({name: 'canonicalUrl', type: 'url', group: 'seo'}),
    defineField({name: 'structuredData', type: 'code', options: {language: 'json'}, group: 'seo'}),
    defineField({name: 'brand', type: 'string', group: 'seo'}),
    defineField({name: 'gtin', type: 'string', group: 'seo'}),
    defineField({name: 'mpn', type: 'string', group: 'seo'}),
    defineField({name: 'googleProductCategory', type: 'string', group: 'seo'}),
    defineField({name: 'medusaProductId', type: 'string', readOnly: true, validation: (Rule) => Rule.required(), group: 'integration'}),
    defineField({name: 'medusaVariantId', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'lastSyncedFromMedusa', type: 'datetime', readOnly: true, group: 'integration'}),

    defineField({name: 'availability', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'availableForWholesale', type: 'boolean', readOnly: true, group: 'integration'}),
    defineField({name: 'boxDimensions', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'condition', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'coreRequired', type: 'boolean', readOnly: true, group: 'integration'}),
    defineField({name: 'installOnly', type: 'boolean', readOnly: true, group: 'integration'}),
    defineField({name: 'manualInventoryCount', type: 'number', readOnly: true, group: 'integration'}),
    defineField({name: 'merchantCenterStatus', type: 'object', readOnly: true, group: 'integration', fields: [
      defineField({name: 'isApproved', type: 'boolean'}),
      defineField({name: 'issues', type: 'array', of: [defineArrayMember({type: 'string'})]}),
      defineField({name: 'lastSynced', type: 'datetime'}),
      defineField({name: 'needsCategory', type: 'boolean'}),
      defineField({name: 'needsGtin', type: 'boolean'}),
      defineField({name: 'needsMpn', type: 'boolean'}),
    ]}),
    defineField({name: 'onSale', type: 'boolean', readOnly: true, group: 'integration'}),
    defineField({name: 'price', type: 'number', readOnly: true, group: 'integration'}),
    defineField({name: 'productType', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'serviceDeliveryModel', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'shippingClass', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'shippingConfig', type: 'object', readOnly: true, group: 'integration', fields: [
      defineField({name: 'callForShippingQuote', type: 'boolean'}),
      defineField({name: 'dimensions', type: 'object', fields: [
        defineField({name: 'height', type: 'number'}),
        defineField({name: 'length', type: 'number'}),
        defineField({name: 'width', type: 'number'}),
      ]}),
      defineField({name: 'freeShippingEligible', type: 'boolean'}),
      defineField({name: 'handlingTime', type: 'number'}),
      defineField({name: 'requiresShipping', type: 'boolean'}),
      defineField({name: 'separateShipment', type: 'boolean'}),
      defineField({name: 'shippingClass', type: 'string'}),
      defineField({name: 'weight', type: 'number'}),
    ]}),
    defineField({name: 'shippingLabel', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'shippingWeight', type: 'number', readOnly: true, group: 'integration'}),
    defineField({name: 'sku', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'specialShippingNotes', type: 'text', rows: 2, readOnly: true, group: 'integration'}),
    defineField({name: 'status', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'stripeActive', type: 'boolean', readOnly: true, group: 'integration'}),
    defineField({name: 'stripeDefaultPriceId', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'stripeLastSyncedAt', type: 'datetime', readOnly: true, group: 'integration'}),
    defineField({name: 'stripeMetadata', type: 'array', readOnly: true, group: 'integration', of: [
      defineArrayMember({
        type: 'object',
        fields: [
          defineField({name: 'key', type: 'string'}),
          defineField({name: 'value', type: 'string'}),
        ],
      }),
    ]}),
    defineField({name: 'stripePriceId', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'stripePrices', type: 'array', readOnly: true, group: 'integration', of: [
      defineArrayMember({
        type: 'object',
        fields: [
          defineField({name: 'priceId', type: 'string'}),
          defineField({name: 'nickname', type: 'string'}),
          defineField({name: 'active', type: 'boolean'}),
          defineField({name: 'billingScheme', type: 'string'}),
          defineField({name: 'createdAt', type: 'datetime'}),
          defineField({name: 'currency', type: 'string'}),
          defineField({name: 'livemode', type: 'boolean'}),
          defineField({name: 'taxBehavior', type: 'string'}),
          defineField({name: 'type', type: 'string'}),
          defineField({name: 'unitAmount', type: 'number'}),
          defineField({name: 'unitAmountRaw', type: 'number'}),
          defineField({name: 'metadata', type: 'array', of: [
            defineArrayMember({
              type: 'object',
              fields: [
                defineField({name: 'key', type: 'string'}),
                defineField({name: 'value', type: 'string'}),
              ],
            }),
          ]}),
        ],
      }),
    ]}),
    defineField({name: 'stripeProductId', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'stripeUpdatedAt', type: 'datetime', readOnly: true, group: 'integration'}),
    defineField({name: 'taxBehavior', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'wholesalePriceStandard', type: 'number', readOnly: true, group: 'integration'}),
    defineField({name: 'wholesalePricePreferred', type: 'number', readOnly: true, group: 'integration'}),
    defineField({name: 'wholesalePricePlatinum', type: 'number', readOnly: true, group: 'integration'}),
  ],
  preview: {
    select: {
      title: 'displayTitle',
      fallbackTitle: 'title',
      subtitle: 'contentStatus',
      legacyStatus: 'status',
      media: 'images.0',
    },
    prepare(selection) {
      const title = selection.title || selection.fallbackTitle || 'Untitled product'
      const legacyMap: Record<string, string> = {
        active: 'published',
        archived: 'draft',
        inactive: 'draft',
        live: 'published',
        preview: 'review',
      }
      const resolvedStatus =
        selection.subtitle ||
        (typeof selection.legacyStatus === 'string'
          ? legacyMap[selection.legacyStatus.toLowerCase()] || selection.legacyStatus
          : '')
      const subtitle = resolvedStatus ? `Content: ${resolvedStatus}` : 'Content enrichment'
      return {title, subtitle, media: selection.media}
    },
  },
})

export default product
