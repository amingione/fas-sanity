/**
 * GET /api/vendor/profile
 *
 * Returns the authenticated vendor's full profile.
 * Requires a valid bearer token issued by /api/vendor/auth/login.
 *
 * Response 200: { vendor: AuthenticatedVendor }
 * Response 401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, handleAuthError, jsonOk} from '@/lib/vendorAuth'

export const GET: APIRoute = async ({request}) => {
  try {
    const {vendor} = await requireVendorAuth(request)
    return jsonOk({vendor})
  } catch (err) {
    return handleAuthError(err)
  }
}

// Block non-GET
export const POST: APIRoute = () => {
  return new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
}
