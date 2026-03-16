import {defineField, defineType} from 'sanity'

/**
 * vendorProductSubmission
 *
 * Created when a vendor submits a product for consideration via the portal
 * (POST /api/vendor/products/submit → fas-cms-fresh).
 *
 * Workflow: pending → approved (triggers Medusa + Sanity product creation)
 *                   → rejected (vendor notified via email)
 */

const STATUS_OPTIONS = [
  {title: 'Pending Review', value: 'pending'},
  {title: 'Approved', value: 'approved'},
  {title: 'Rejected', value: 'rejected'},
  {title: 'Needs More Info', value: 'needs_info'},
]

export default defineType({
  name: 'vendorProductSubmission',
  title: 'Vendor Product Submission',
  type: 'document',
  fields: [
    // ── Status ───────────────────────────────────────────────────────────────
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {list: STATUS_OPTIONS, layout: 'radio'},
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),

    // ── Vendor relationship ───────────────────────────────────────────────────
    defineField({
      name: 'vendor',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'submittedByEmail',
      title: 'Submitted By (Email)',
      type: 'string',
      description: 'Portal user email at time of submission',
    }),

    // ── Product details ───────────────────────────────────────────────────────
    defineField({
      name: 'productName',
      title: 'Product Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'brandName',
      title: 'Brand / Manufacturer',
      type: 'string',
    }),
    defineField({
      name: 'sku',
      title: 'SKU / Part Number',
      type: 'string',
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      description: 'e.g. Wheels, Suspension, Exterior, Interior',
    }),
    defineField({
      name: 'description',
      title: 'Product Description',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'proposedWholesalePrice',
      title: 'Proposed Wholesale Price (USD)',
      type: 'number',
      description: 'Vendor-suggested wholesale price',
    }),
    defineField({
      name: 'proposedMsrp',
      title: 'Proposed MSRP (USD)',
      type: 'number',
    }),
    defineField({
      name: 'minimumOrderQty',
      title: 'Minimum Order Quantity',
      type: 'number',
      initialValue: 1,
    }),
    defineField({
      name: 'leadTimeDays',
      title: 'Lead Time (business days)',
      type: 'number',
    }),

    // ── Images / files ────────────────────────────────────────────────────────
    defineField({
      name: 'images',
      title: 'Product Images',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
    }),
    defineField({
      name: 'specSheet',
      title: 'Spec Sheet / Data Sheet',
      type: 'file',
    }),

    // ── Fitment / compatibility ───────────────────────────────────────────────
    defineField({
      name: 'fitmentNotes',
      title: 'Fitment / Compatibility Notes',
      type: 'text',
      rows: 3,
      description: 'Vehicle years, makes, models this product fits',
    }),
    defineField({
      name: 'upc',
      title: 'UPC',
      type: 'string',
    }),

    // ── Admin review ──────────────────────────────────────────────────────────
    defineField({
      name: 'adminNotes',
      title: 'Admin Notes (internal)',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'rejectionReason',
      title: 'Rejection Reason (shown to vendor)',
      type: 'text',
      rows: 2,
      hidden: ({document}) => document?.status !== 'rejected' && document?.status !== 'needs_info',
    }),
    defineField({
      name: 'reviewedBy',
      title: 'Reviewed By',
      type: 'string',
      description: 'Admin who reviewed this submission',
    }),
    defineField({
      name: 'reviewedAt',
      title: 'Reviewed At',
      type: 'datetime',
    }),

    // ── Linked Sanity product (post-approval) ─────────────────────────────────
    defineField({
      name: 'linkedProduct',
      title: 'Linked Product (post-approval)',
      type: 'reference',
      to: [{type: 'product'}],
      description: 'Set after approval when the product is created in Sanity',
    }),

    // ── Timestamps ────────────────────────────────────────────────────────────
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
    }),
  ],

  preview: {
    select: {
      title: 'productName',
      subtitle: 'vendor.companyName',
      status: 'status',
    },
    prepare({title, subtitle, status}) {
      const statusEmoji: Record<string, string> = {
        pending: '🕐',
        approved: '✅',
        rejected: '❌',
        needs_info: '❓',
      }
      return {
        title: title || 'Unnamed Submission',
        subtitle: `${statusEmoji[status] ?? ''} ${subtitle || 'Unknown Vendor'} · ${status || 'pending'}`,
      }
    },
  },

  orderings: [
    {
      title: 'Submitted (Newest)',
      name: 'submittedAtDesc',
      by: [{field: 'submittedAt', direction: 'desc'}],
    },
    {
      title: 'Status',
      name: 'statusAsc',
      by: [{field: 'status', direction: 'asc'}],
    },
  ],
})
