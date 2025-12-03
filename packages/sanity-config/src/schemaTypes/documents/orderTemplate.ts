import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'orderTemplate',
  title: 'Order Template',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Template Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      of: [
        defineField({
          name: 'item',
          type: 'object',
          fields: [
            defineField({
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{type: 'product'}],
            }),
            defineField({
              name: 'quantity',
              title: 'Default Quantity',
              type: 'number',
              validation: (Rule) => Rule.required().min(1),
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      vendor: 'vendor.companyName',
      itemCount: 'items.length',
    },
    prepare({title, vendor, itemCount}) {
      const count = typeof itemCount === 'number' ? itemCount : 0
      return {
        title: title || 'Template',
        subtitle: `${vendor || 'Vendor'} | ${count} items`,
      }
    },
  },
})
