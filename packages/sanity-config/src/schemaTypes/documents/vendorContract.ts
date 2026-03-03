/**
 * Sanity schema: vendorContract
 *
 * Vendor agreements, terms, NDAs, and pricing contracts managed by FAS staff.
 * Vendors can view (but not edit) their contracts through the portal.
 *
 * Files are stored in Sanity CDN assets. PDF upload is supported.
 */

import {defineField, defineType} from 'sanity'
import {DocumentTextIcon} from '@sanity/icons'

const CONTRACT_TYPE_OPTIONS = [
  {title: 'Wholesale Agreement', value: 'wholesale_agreement'},
  {title: 'Non-Disclosure Agreement', value: 'nda'},
  {title: 'Pricing Terms', value: 'pricing_terms'},
  {title: 'Service Agreement', value: 'service_agreement'},
  {title: 'Purchase Order Terms', value: 'po_terms'},
  {title: 'Return Policy', value: 'return_policy'},
  {title: 'Other', value: 'other'},
]

const CONTRACT_STATUS_OPTIONS = [
  {title: 'Draft', value: 'draft'},
  {title: 'Pending Signature', value: 'pending_signature'},
  {title: 'Active', value: 'active'},
  {title: 'Expired', value: 'expired'},
  {title: 'Terminated', value: 'terminated'},
]

export default defineType({
  name: 'vendorContract',
  title: 'Vendor Contract',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Contract Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contractType',
      title: 'Contract Type',
      type: 'string',
      options: {list: CONTRACT_TYPE_OPTIONS},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: CONTRACT_STATUS_OPTIONS},
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendorRef',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      description: 'The vendor this contract applies to.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contractFile',
      title: 'Contract File',
      type: 'file',
      description: 'PDF or document file for this contract.',
      options: {accept: '.pdf,.doc,.docx'},
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'Brief summary of what this contract covers.',
    }),
    defineField({
      name: 'effectiveDate',
      title: 'Effective Date',
      type: 'date',
    }),
    defineField({
      name: 'expirationDate',
      title: 'Expiration Date',
      type: 'date',
    }),
    defineField({
      name: 'autoRenew',
      title: 'Auto-Renew',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'signedAt',
      title: 'Signed At',
      type: 'datetime',
      description: 'Timestamp when vendor countersigned (if applicable).',
    }),
    defineField({
      name: 'signedByName',
      title: 'Signed By (Vendor)',
      type: 'string',
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 3,
      description: 'Internal FAS notes — not visible to vendor in portal.',
    }),
    defineField({
      name: 'visibleToVendor',
      title: 'Visible to Vendor',
      type: 'boolean',
      description: 'When true, vendor can view/download this contract in their portal.',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      contractType: 'contractType',
      status: 'status',
      vendorName: 'vendorRef.companyName',
    },
    prepare({title, contractType, status, vendorName}: {
      title?: string
      contractType?: string
      status?: string
      vendorName?: string
    }) {
      const typeLabel = CONTRACT_TYPE_OPTIONS.find((o) => o.value === contractType)?.title || contractType || ''
      const statusLabel = CONTRACT_STATUS_OPTIONS.find((o) => o.value === status)?.title || status || ''
      return {
        title: title || 'Contract',
        subtitle: `${vendorName ?? 'Unknown vendor'} · ${typeLabel} · ${statusLabel}`,
      }
    },
  },
  orderings: [
    {
      title: 'Effective Date (Newest)',
      name: 'effectiveDateDesc',
      by: [{field: 'effectiveDate', direction: 'desc'}],
    },
    {
      title: 'Vendor Name',
      name: 'vendorNameAsc',
      by: [{field: 'vendorRef.companyName', direction: 'asc'}],
    },
  ],
})
