/**
 * Vendor Portal Auth Utilities
 *
 * Shared helpers for validating bearer tokens in /api/vendor/* Astro endpoints.
 *
 * Flow:
 *   1. Client sends   Authorization: Bearer <raw-token>
 *   2. We SHA-256 hash the raw token
 *   3. GROQ query finds vendorAuthToken by tokenHash
 *   4. Check: not revoked, not expired
 *   5. Return the resolved vendor document
 *
 * Usage:
 *   import { requireVendorAuth } from '@/lib/vendorAuth'
 *   const { vendor, token } = await requireVendorAuth(request)  // throws on invalid
 */

import {createHash} from 'crypto'
import {sanityClient} from '@/sanity/lib/client'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VendorPortalAccess {
  enabled?: boolean
  email?: string
  permissions?: string[]
  invitedAt?: string
  lastLogin?: string
  passwordHash?: string
}

export interface VendorShippingAddress {
  _key: string
  label?: string
  isDefault?: boolean
  street?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface VendorNotificationPreferences {
  orderUpdates?: boolean
  quoteActivity?: boolean
  paymentReminders?: boolean
  shipmentTracking?: boolean
  invoiceAlerts?: boolean
  marketingEmails?: boolean
}

export interface AuthenticatedVendor {
  _id: string
  vendorNumber: string
  companyName: string
  displayName?: string
  status: string
  pricingTier?: string
  portalEnabled?: boolean
  portalAccess?: VendorPortalAccess
  shippingAddresses?: VendorShippingAddress[]
  notificationPreferences?: VendorNotificationPreferences
  primaryContact?: {
    name?: string
    email?: string
    phone?: string
  }
}

export interface AuthenticatedToken {
  _id: string
  vendorId: string
  email: string
  scopes: string[]
  expiresAt: string
}

export class VendorAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message)
    this.name = 'VendorAuthError'
  }
}

// ─── GROQ queries ──────────────────────────────────────────────────────────────

const TOKEN_QUERY = `*[
  _type == "vendorAuthToken" &&
  tokenHash == $tokenHash &&
  !defined(revokedAt) &&
  expiresAt > $now
][0]{
  _id,
  vendorId,
  email,
  scopes,
  expiresAt
}`

const VENDOR_BY_ID_QUERY = `*[_type == "vendor" && _id == $id][0]{
  _id,
  vendorNumber,
  companyName,
  displayName,
  status,
  pricingTier,
  portalEnabled,
  portalAccess {
    enabled,
    email,
    permissions,
    invitedAt,
    lastLogin
  },
  shippingAddresses[] {
    _key,
    label,
    isDefault,
    street,
    address2,
    city,
    state,
    zip,
    country
  },
  notificationPreferences {
    orderUpdates,
    quoteActivity,
    paymentReminders,
    shipmentTracking,
    invoiceAlerts,
    marketingEmails
  },
  primaryContact {
    name,
    email,
    phone
  }
}`

// ─── Token hashing ─────────────────────────────────────────────────────────────

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

// ─── Extract bearer token from request ────────────────────────────────────────

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

// ─── Core auth function ────────────────────────────────────────────────────────

export async function requireVendorAuth(request: Request): Promise<{
  vendor: AuthenticatedVendor
  token: AuthenticatedToken
}> {
  const rawToken = extractBearerToken(request)
  if (!rawToken) {
    throw new VendorAuthError('Missing Authorization header', 401)
  }

  const tokenHash = hashToken(rawToken)
  const now = new Date().toISOString()

  const tokenDoc = await sanityClient.fetch<AuthenticatedToken | null>(TOKEN_QUERY, {
    tokenHash,
    now,
  })

  if (!tokenDoc) {
    throw new VendorAuthError('Invalid or expired token', 401)
  }

  const vendor = await sanityClient.fetch<AuthenticatedVendor | null>(VENDOR_BY_ID_QUERY, {
    id: tokenDoc.vendorId,
  })

  if (!vendor) {
    throw new VendorAuthError('Vendor not found', 401)
  }

  // Ensure vendor portal access is still active
  const portalActive = vendor.portalEnabled !== false && vendor.portalAccess?.enabled !== false
  if (!portalActive) {
    throw new VendorAuthError('Vendor portal access is disabled', 403)
  }

  if (vendor.status === 'suspended' || vendor.status === 'inactive') {
    throw new VendorAuthError('Vendor account is not active', 403)
  }

  return {vendor, token: tokenDoc}
}

// ─── Permission check helper ───────────────────────────────────────────────────

export function requirePermission(
  token: AuthenticatedToken,
  permission: string,
): void {
  const scopes = token.scopes ?? []
  if (!scopes.includes(permission)) {
    throw new VendorAuthError(`Missing required permission: ${permission}`, 403)
  }
}

// ─── Standard JSON response helpers ───────────────────────────────────────────

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}

export function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({error: message}), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}

export function handleAuthError(err: unknown): Response {
  if (err instanceof VendorAuthError) {
    return jsonError(err.message, err.statusCode)
  }
  console.error('[vendor-api] Unexpected error:', err)
  return jsonError('Internal server error', 500)
}
