import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorProduct',
  title: 'Vendor Product',
  type: 'document',
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
      description: 'Cost from vendor',
    }),
    defineField({
      name: 'quantityAvailable',
      title: 'Quantity Available',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'leadTime',
      title: 'Lead Time (days)',
      type: 'number',
      description: 'Number of days to fulfill order',
    }),
    defineField({
      name: 'minimumOrder',
      title: 'Minimum Order Quantity',
      type: 'number',
      initialValue: 1,
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'lastUpdated',
      title: 'Last Updated',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      product: 'product.title',
      vendor: 'vendor.companyName',
      quantity: 'quantityAvailable',
      active: 'active',
    },
    prepare({product, vendor, quantity, active}) {
      const qty = typeof quantity === 'number' ? quantity : 0
      return {
        title: product || 'Product',
        subtitle: `${vendor || 'Vendor'} | Qty: ${qty} | ${active ? 'Active' : 'Inactive'}`,
      }
    },
  },
})
