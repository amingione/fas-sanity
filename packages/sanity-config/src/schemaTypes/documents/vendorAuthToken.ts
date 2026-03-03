/**
 * Sanity schema: vendorAuthToken
 *
 * Short-lived session tokens issued to vendors on successful portal login.
 * Written by /api/vendor/auth/login — never created manually in Studio.
 *
 * Token lifecycle:
 *   - Created on login, expires after 24 hours (TTL enforced by API layer)
 *   - Revoked explicitly on logout (deletedAt set) OR by expiry check on every request
 *   - Each vendor may have multiple concurrent tokens (multi-tab/device support)
 *
 * Security: `tokenHash` stores bcrypt or SHA-256 of the actual token.
 *           The raw token is NEVER stored in Sanity.
 */

import {defineField, defineType} from 'sanity'
import {AccessDeniedIcon} from '@sanity/icons'

export default defineType({
  name: 'vendorAuthToken',
  title: 'Vendor Auth Tokens',
  type: 'document',
  icon: AccessDeniedIcon,
  // System document — programmatic-only; all fields are readOnly so Studio users cannot create/edit
  fields: [
    defineField({
      name: 'tokenHash',
      title: 'Token Hash',
      type: 'string',
      description: 'SHA-256 hex hash of the raw bearer token. Never store the raw token.',
      readOnly: true,
      hidden: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendorRef',
      title: 'Vendor',
      type: 'reference',
      to: [{type: 'vendor'}],
      description: 'The vendor this token belongs to.',
      readOnly: true,
      options: {disableNew: true},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendorId',
      title: 'Vendor ID',
      type: 'string',
      description: 'Denormalized Sanity vendor _id for fast GROQ queries (without drafts. prefix).',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'email',
      title: 'Portal Email',
      type: 'string',
      description: 'Email address used to authenticate this session.',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'scopes',
      title: 'Scopes',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Permission scopes granted to this token (snapshot of vendor.portalAccess.permissions at login time).',
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      title: 'Expires At',
      type: 'datetime',
      description: 'Token expiry timestamp. Tokens are invalid after this time.',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'issuedAt',
      title: 'Issued At',
      type: 'datetime',
      description: 'Timestamp when this token was created.',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'revokedAt',
      title: 'Revoked At',
      type: 'datetime',
      description: 'Set on explicit logout. Null means token is still active (subject to expiry).',
      readOnly: true,
    }),
    defineField({
      name: 'userAgent',
      title: 'User Agent',
      type: 'string',
      description: 'Browser user-agent string at login time (for audit logging).',
      readOnly: true,
    }),
    defineField({
      name: 'ipAddress',
      title: 'IP Address',
      type: 'string',
      description: 'Client IP at login time (for audit logging).',
      readOnly: true,
      hidden: true,
    }),
  ],
  preview: {
    select: {
      vendorId: 'vendorId',
      email: 'email',
      expiresAt: 'expiresAt',
      revokedAt: 'revokedAt',
    },
    prepare({vendorId, email, expiresAt, revokedAt}: {
      vendorId?: string
      email?: string
      expiresAt?: string
      revokedAt?: string
    }) {
      const expiry = expiresAt ? new Date(expiresAt).toLocaleString() : 'unknown'
      const state = revokedAt ? '⛔ Revoked' : `Expires ${expiry}`
      return {
        title: email || vendorId || 'Token',
        subtitle: state,
      }
    },
  },
  orderings: [
    {
      title: 'Newest First',
      name: 'issuedAtDesc',
      by: [{field: 'issuedAt', direction: 'desc'}],
    },
  ],
})
