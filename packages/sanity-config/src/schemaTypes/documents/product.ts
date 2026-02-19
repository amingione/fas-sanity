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
      validation: (Rule) => Rule.required(),
      group: 'content',
    }),
    defineField({name: 'shortDescription', type: 'text', rows: 3, group: 'content'}),
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
    defineField({
      name: 'medusaProductId',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
      group: 'integration',
    }),
    defineField({name: 'medusaVariantId', type: 'string', readOnly: true, group: 'integration'}),
    defineField({name: 'lastSyncedFromMedusa', type: 'datetime', readOnly: true, group: 'integration'}),
  ],
  preview: {
    select: {
      title: 'displayTitle',
      fallbackTitle: 'title',
      subtitle: 'contentStatus',
      media: 'images.0',
    },
    prepare(selection) {
      const title = selection.title || selection.fallbackTitle || 'Untitled product'
      const subtitle = selection.subtitle ? `Content: ${selection.subtitle}` : 'Content enrichment'
      return {title, subtitle, media: selection.media}
    },
  },
})

export default product
