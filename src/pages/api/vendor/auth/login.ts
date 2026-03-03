/**
 * POST /api/vendor/auth/login
 *
 * Authenticates a vendor portal user with email + password.
 * Returns a bearer token valid for 24 hours.
 *
 * Request body: { email: string, password: string }
 * Response 200: { token: string, vendor: { id, companyName, scopes } }
 * Response 401: { error: string }
 */

import type {APIRoute} from 'astro'
import {compare} from 'bcryptjs'
import {randomBytes, createHash} from 'crypto'
import {sanityClient} from '@/sanity/lib/client'
import {jsonOk, jsonError} from '@/lib/vendorAuth'

// GROQ — look up vendor by portal email (never returns passwordHash to client)
const VENDOR_LOGIN_QUERY = `*[
  _type == "vendor" &&
  (portalAccess.email == $email || primaryContact.email == $email) &&
  (portalEnabled == true || portalAccess.enabled == true)
][0]{
  _id,
  companyName,
  status,
  portalEnabled,
  "portalEmail": coalesce(portalAccess.email, primaryContact.email),
  "passwordHash": portalAccess.passwordHash,
  "permissions": portalAccess.permissions,
  "portalAccessEnabled": portalAccess.enabled
}`

type VendorLoginDoc = {
  _id: string
  companyName: string
  status: string
  portalEnabled?: boolean
  portalEmail?: string
  passwordHash?: string
  permissions?: string[]
  portalAccessEnabled?: boolean
}

function generateRawToken(): string {
  return randomBytes(40).toString('hex')
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export const POST: APIRoute = async ({request}) => {
  // Parse body
  let body: {email?: unknown; password?: unknown}
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const {email, password} = body
  if (typeof email !== 'string' || !email.trim()) {
    return jsonError('email is required', 400)
  }
  if (typeof password !== 'string' || !password) {
    return jsonError('password is required', 400)
  }

  // Find vendor
  const vendor = await sanityClient.fetch<VendorLoginDoc | null>(VENDOR_LOGIN_QUERY, {
    email: email.toLowerCase().trim(),
  })

  // Constant-time failure path — always compare even when vendor not found
  const dummyHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
  const hashToCompare = vendor?.passwordHash || dummyHash

  const passwordValid = await compare(password, hashToCompare)

  if (!vendor || !passwordValid) {
    return jsonError('Invalid email or password', 401)
  }

  // Check account status
  if (vendor.status === 'suspended') {
    return jsonError('Your account has been suspended. Contact FAS support.', 403)
  }
  if (vendor.status === 'inactive') {
    return jsonError('Your account is inactive. Contact FAS support.', 403)
  }

  const scopes: string[] = vendor.permissions ?? []

  // Issue token
  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const tokenDocId = `vendor-token-${vendor._id}-${hashToken(rawToken).slice(0, 12)}`

  await sanityClient.create({
    _id: tokenDocId,
    _type: 'vendorAuthToken',
    tokenHash,
    vendorRef: {_type: 'reference', _ref: vendor._id},
    vendorId: vendor._id,
    email: email.toLowerCase().trim(),
    scopes,
    expiresAt,
    issuedAt,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
  })

  // Update lastLogin on vendor
  await sanityClient
    .patch(vendor._id)
    .set({'portalAccess.lastLogin': issuedAt})
    .commit()
    .catch((err: unknown) => {
      // Non-fatal — log but don't fail the login response
      console.error('[vendor/auth/login] Failed to update lastLogin:', err)
    })

  return jsonOk({
    token: rawToken,
    expiresAt,
    vendor: {
      id: vendor._id,
      companyName: vendor.companyName,
      scopes,
    },
  })
}

// Block non-POST
export const GET: APIRoute = () => jsonError('Method not allowed', 405)
