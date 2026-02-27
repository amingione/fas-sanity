import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'vendorDocument',
  title: 'Vendor Documents',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({name: 'description', title: 'Description', type: 'text', rows: 3}),
    defineField({name: 'vendor', title: 'Vendor', type: 'reference', to: [{type: 'vendor'}]}),
    defineField({name: 'category', title: 'Category', type: 'string'}),
    defineField({name: 'version', title: 'Version', type: 'string'}),
    defineField({name: 'sharedWithAllVendors', title: 'Shared With All Vendors', type: 'boolean', initialValue: false}),
    defineField({name: 'uploadedAt', title: 'Uploaded At', type: 'datetime'}),
    defineField({name: 'uploadedBy', title: 'Uploaded By', type: 'string'}),
    defineField({name: 'file', title: 'File', type: 'file'}),
  ],
  preview: {
    select: {
      title: 'title',
      vendor: 'vendor.companyName',
      shared: 'sharedWithAllVendors',
    },
    prepare(selection) {
      const title = selection.title || 'Vendor Document'
      const access = selection.shared ? 'all vendors' : selection.vendor || 'single vendor'
      return {title, subtitle: access}
    },
  },
})
