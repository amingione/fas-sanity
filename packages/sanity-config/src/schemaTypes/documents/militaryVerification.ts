import {UserIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'militaryVerification',
  title: 'Military Verification',
  type: 'document',
  icon: UserIcon,
  fields: [
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'firstName',
      title: 'First Name',
      type: 'string',
    }),
    defineField({
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
    }),
    defineField({
      name: 'status',
      title: 'Verification Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Verified', value: 'verified'},
          {title: 'Requires Documents', value: 'requires_documents'},
          {title: 'Failed', value: 'failed'},
          {title: 'Expired', value: 'expired'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'sheerIdVerificationId',
      title: 'SheerID Verification ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'promoCode',
      title: 'Promotion Code',
      type: 'string',
      description: 'Unique Stripe promotion code issued to this user',
      readOnly: true,
    }),
    defineField({
      name: 'stripePromoCodeId',
      title: 'Stripe Promo Code ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'verifiedAt',
      title: 'Verified At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      title: 'Code Expires At',
      type: 'datetime',
      description: 'When the promotion code expires',
    }),
    defineField({
      name: 'redeemedAt',
      title: 'Redeemed At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'documentUploadUrl',
      title: 'Document Upload URL',
      type: 'url',
      description: 'SheerID URL for document upload if instant verification fails',
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [
        {name: 'ipAddress', type: 'string', title: 'IP Address'},
        {name: 'userAgent', type: 'string', title: 'User Agent'},
        {name: 'verificationMethod', type: 'string', title: 'Verification Method'},
      ],
    }),
  ],
  preview: {
    select: {
      email: 'email',
      status: 'status',
      promoCode: 'promoCode',
      verifiedAt: 'verifiedAt',
    },
    prepare({email, status, promoCode, verifiedAt}) {
      const dateLabel = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : ''
      const codeLabel = promoCode ? `Code: ${promoCode}` : ''
      const subtitleParts = [status, codeLabel, dateLabel].filter(Boolean)
      return {
        title: email,
        subtitle: subtitleParts.join(' • '),
        media: UserIcon,
      }
    },
  },
})
