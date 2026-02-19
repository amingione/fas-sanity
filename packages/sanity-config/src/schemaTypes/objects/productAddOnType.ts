import {defineField, defineType} from 'sanity'

export const productAddOnType = defineType({
  name: 'productAddOn',
  title: 'Bundle Add-On',
  type: 'object',
  fields: [
    defineField({name: 'product', type: 'reference', to: [{type: 'product'}], validation: (Rule) => Rule.required()}),
    defineField({name: 'quantity', type: 'number', initialValue: 1, validation: (Rule) => Rule.required().min(1).integer()}),
    defineField({name: 'customLabel', type: 'string'}),
    defineField({name: 'description', type: 'text', rows: 2}),
    defineField({name: 'defaultSelected', type: 'boolean', initialValue: false}),
    defineField({name: 'required', type: 'boolean', initialValue: false}),
  ],
  preview: {
    select: {
      productTitle: 'product.title',
      customLabel: 'customLabel',
      quantity: 'quantity',
      media: 'product.images.0',
    },
    prepare({productTitle, customLabel, quantity, media}) {
      return {
        title: customLabel || productTitle || 'Bundle add-on',
        subtitle: `Qty: ${quantity || 1}`,
        media,
      }
    },
  },
})
