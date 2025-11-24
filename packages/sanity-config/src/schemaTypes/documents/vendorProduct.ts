import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorProduct',
  title: 'Vendor Product',
  type: 'document',
  description: 'Products managed by vendors in their portal',
  fields: [
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendorSku',
      title: 'Vendor SKU',
      type: 'string',
      description: "Vendor's internal SKU for this product",
    }),
    defineField({
      name: 'cost',
      title: 'Cost',
      type: 'number',
      description: 'What we pay the vendor',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'quantityAvailable',
      title: 'Quantity Available',
      type: 'number',
      description: 'Stock available from vendor',
      initialValue: 0,
    }),
    defineField({
      name: 'leadTime',
      title: 'Lead Time (days)',
      type: 'number',
      description: 'Days from order to delivery',
    }),
    defineField({
      name: 'minimumOrder',
      title: 'Minimum Order Quantity',
      type: 'number',
      initialValue: 1,
    }),
    defineField({
      name: 'lastUpdated',
      title: 'Last Updated',
      type: 'datetime',
      description: 'When vendor last updated this info',
      readOnly: true,
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      description: 'Vendor still supplies this product',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      product: 'product.title',
      vendor: 'vendor.companyName',
      cost: 'cost',
      quantity: 'quantityAvailable',
    },
    prepare(selection) {
      const {product, vendor, cost, quantity} = selection
      const price = typeof cost === 'number' ? cost : 0
      const qty = typeof quantity === 'number' ? quantity : 0
      return {
        title: product || 'Vendor Product',
        subtitle: `${vendor || 'Vendor'} • $${price} • Stock: ${qty}`,
      }
    },
  },
})
