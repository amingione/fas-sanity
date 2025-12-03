import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorDocument',
  title: 'Vendor Document',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Contract', value: 'contract'},
          {title: 'Terms & Conditions', value: 'terms'},
          {title: 'Price List', value: 'price_list'},
          {title: 'Catalog', value: 'catalog'},
          {title: 'Marketing Materials', value: 'marketing'},
          {title: 'Compliance', value: 'compliance'},
          {title: 'Other', value: 'other'},
        ],
      },
    }),
    defineField({
      name: 'file',
      title: 'File',
      type: 'file',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      description: 'Leave empty if shared with all vendors',
    }),
    defineField({
      name: 'sharedWithAllVendors',
      title: 'Shared with All Vendors',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      description: 'e.g., 1.0, 2.1',
    }),
    defineField({
      name: 'uploadedAt',
      title: 'Uploaded At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'uploadedBy',
      title: 'Uploaded By',
      type: 'string',
      description: 'User who uploaded this document',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      category: 'category',
      vendor: 'vendor.companyName',
      shared: 'sharedWithAllVendors',
    },
    prepare({title, category, vendor, shared}) {
      return {
        title: title || 'Document',
        subtitle: `${category || 'Category'} | ${shared ? 'All Vendors' : vendor || 'Specific Vendor'}`,
      }
    },
  },
})
