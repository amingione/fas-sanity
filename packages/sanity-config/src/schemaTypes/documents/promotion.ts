import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'promotion',
  title: 'Promotion',
  type: 'document',
  description:
    'Marketing/content promotion record. Must not be used to compute checkout totals. Discounts/coupons are enforced in Medusa; this document is for display and internal planning only.',
  fields: [
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'code',
      title: 'Code',
      type: 'string',
      description:
        'Marketing code label only. Do not assume this code is valid for checkout unless it exists and is enforced in Medusa.',
    }),
    defineField({
      name: 'discountType',
      title: 'Discount Type',
      type: 'string',
      description:
        'Marketing metadata only (for display/communications). Checkout discount enforcement belongs to Medusa.',
      options: {
        list: [
          {title: 'Percentage', value: 'percentage'},
          {title: 'Fixed Amount', value: 'fixed_amount'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'discountValue',
      title: 'Discount Value',
      type: 'number',
      description:
        'Marketing metadata only. Do not compute order totals from this field; Medusa enforces discounts.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'validFrom',
      title: 'Valid From',
      type: 'datetime',
    }),
    defineField({
      name: 'validUntil',
      title: 'Valid Until',
      type: 'datetime',
    }),
    defineField({
      name: 'conditions',
      title: 'Conditions',
      type: 'object',
      fields: [
        defineField({
          name: 'rules',
          title: 'Rules',
          type: 'array',
          of: [{type: 'string'}],
          description: 'Optional human-readable promotion conditions.',
        }),
      ],
    }),
  ],
})
