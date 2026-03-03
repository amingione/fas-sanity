/**
 * PATCH /api/vendor/profile/update
 *
 * Updates mutable vendor profile fields:
 *   - primaryContact (name, phone — NOT email)
 *   - shippingAddresses (full replacement of array)
 *   - notificationPreferences (partial or full)
 *
 * Writes a vendorActivityEvent for the update.
 *
 * Request body: Partial<VendorProfileUpdatePayload>
 * Response 200: { success: true, updated: string[] }
 * Response 400/401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {
  requireVendorAuth,
  handleAuthError,
  jsonOk,
  jsonError,
  type VendorShippingAddress,
  type VendorNotificationPreferences,
} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

interface PrimaryContactUpdate {
  name?: string
  phone?: string
}

interface VendorProfileUpdatePayload {
  primaryContact?: PrimaryContactUpdate
  shippingAddresses?: VendorShippingAddress[]
  notificationPreferences?: Partial<VendorNotificationPreferences>
}

// Allowed notification preference keys
const NOTIFICATION_KEYS = new Set([
  'orderUpdates',
  'quoteActivity',
  'paymentReminders',
  'shipmentTracking',
  'invoiceAlerts',
  'marketingEmails',
])

export const PATCH: APIRoute = async ({request}) => {
  try {
    const {vendor, token} = await requireVendorAuth(request)

    let body: VendorProfileUpdatePayload
    try {
      body = await request.json()
    } catch {
      return jsonError('Invalid JSON', 400)
    }

    const updated: string[] = []
    let patch = sanityClient.patch(vendor._id)

    // --- primaryContact (name + phone only — email is auth-controlled) ---
    if (body.primaryContact !== undefined) {
      const {name, phone} = body.primaryContact
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return jsonError('primaryContact.name must be a non-empty string', 400)
        }
        patch = patch.set({'primaryContact.name': name.trim()})
        updated.push('primaryContact.name')
      }
      if (phone !== undefined) {
        if (typeof phone !== 'string') {
          return jsonError('primaryContact.phone must be a string', 400)
        }
        patch = patch.set({'primaryContact.phone': phone.trim()})
        updated.push('primaryContact.phone')
      }
    }

    // --- shippingAddresses (full replace) ---
    if (body.shippingAddresses !== undefined) {
      if (!Array.isArray(body.shippingAddresses)) {
        return jsonError('shippingAddresses must be an array', 400)
      }
      // Ensure each entry has _key (required for Sanity arrays)
      const addresses = body.shippingAddresses.map((addr, i) => ({
        _key: addr._key || `addr-${i}-${Date.now()}`,
        label: addr.label,
        isDefault: addr.isDefault ?? false,
        street: addr.street,
        address2: addr.address2,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country ?? 'US',
      }))
      patch = patch.set({shippingAddresses: addresses})
      updated.push('shippingAddresses')
    }

    // --- notificationPreferences (partial merge) ---
    if (body.notificationPreferences !== undefined) {
      if (typeof body.notificationPreferences !== 'object') {
        return jsonError('notificationPreferences must be an object', 400)
      }
      const prefs = body.notificationPreferences
      const prefPatch: Record<string, boolean> = {}
      for (const [key, val] of Object.entries(prefs)) {
        if (!NOTIFICATION_KEYS.has(key)) {
          return jsonError(`Invalid notification preference key: ${key}`, 400)
        }
        if (typeof val !== 'boolean') {
          return jsonError(`notificationPreferences.${key} must be a boolean`, 400)
        }
        prefPatch[`notificationPreferences.${key}`] = val
      }
      if (Object.keys(prefPatch).length > 0) {
        patch = patch.set(prefPatch)
        updated.push('notificationPreferences')
      }
    }

    if (updated.length === 0) {
      return jsonError('No valid fields provided for update', 400)
    }

    await patch.commit()

    // Write activity event (non-fatal if fails)
    await sanityClient
      .create({
        _type: 'vendorActivityEvent',
        eventId: `profile-update-${vendor._id}-${Date.now()}`,
        eventType: 'vendor.profile.updated',
        vendorRef: {_type: 'reference', _ref: vendor._id},
        vendorId: vendor._id,
        occurredAt: new Date().toISOString(),
        summary: `Profile updated: ${updated.join(', ')}`,
        metadata: {updatedFields: updated, updatedBy: token.email},
      })
      .catch((err: unknown) => {
        console.error('[vendor/profile/update] Failed to write activity event:', err)
      })

    return jsonOk({success: true, updated})
  } catch (err) {
    return handleAuthError(err)
  }
}

// Block non-PATCH
export const GET: APIRoute = () =>
  new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
