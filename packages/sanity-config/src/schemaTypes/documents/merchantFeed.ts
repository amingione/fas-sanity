import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'merchantFeed',
  title: 'Merchant Feed',
  type: 'document',
  fields: [
    defineField({name: 'sku', title: 'SKU', type: 'string'}),
    defineField({name: 'gtin', title: 'GTIN', type: 'string'}),
    defineField({name: 'mpn', title: 'MPN', type: 'string'}),
    defineField({name: 'title', title: 'Title', type: 'string'}),
    defineField({name: 'description', title: 'Description', type: 'text'}),
    defineField({name: 'link', title: 'Link', type: 'url'}),
    defineField({name: 'image_link', title: 'Image Link', type: 'url'}),
    defineField({name: 'availability', title: 'Availability', type: 'string'}),
    defineField({name: 'price', title: 'Price', type: 'string'}),
    defineField({name: 'sale_price', title: 'Sale Price', type: 'string'}),
    defineField({
      name: 'brand',
      title: 'Brand',
      type: 'string',
      initialValue: 'FAS Motorsports',
    }),
    defineField({
      name: 'linkedProduct',
      title: 'Linked Product',
      type: 'reference',
      to: [{type: 'product'}],
    }),
  ],
})
