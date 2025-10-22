import type { Handler } from '@netlify/functions'
import 'dotenv/config'

// Optional: simple shared-secret verification.
// Set SHIPENGINE_WEBHOOK_TOKEN in your env, and configure ShipEngine to send the same token
// in the `x-webhook-token` header or as a `?token=` query param.
const checkToken = (event: Parameters<Handler>[0]) => {
  const expected = process.env.SHIPENGINE_WEBHOOK_TOKEN
  if (!expected) return true // no token configured -> allow (dev convenience). Set it in prod.
    const hdr = event.headers['x-webhook-token'] || event.headers['X-Webhook-Token']
    // Safer: also read from query string directly
  const qsToken = new URL(event.rawUrl || 'https://fasmotorsports.com').searchParams.get('token')
  return hdr === expected || qsToken === expected
}

// --- Minimal Sanity client (only if credentials are present) ---
type SanityClient = {
  fetch: (q: string, params?: Record<string, unknown>) => Promise<any>
  patch: (id: string) => { set: (data: any) => { commit: () => Promise<any> } }
  createIfNotExists: (doc: any) => Promise<any>
}

const getSanity = async (): Promise<SanityClient | null> => {
  const pid = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
  const ds = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
  const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN
  if (!pid || !ds || !token) return null
  const { createClient } = await import('@sanity/client')
  return createClient({ projectId: pid, dataset: ds, apiVersion: '2023-06-07', token, useCdn: false }) as unknown as SanityClient
}

// Helpers to persist tracking/label state back into Sanity
const upsertTracking = async (client: SanityClient, trackingNumber: string, status: any) => {
  // Try to find a shipment or order doc by trackingNumber
  const hit = await client.fetch(
    '*[(_type=="shipment" || _type=="order") && trackingNumber == $tn][0]{_id}',
    { tn: trackingNumber }
  )
  if (hit?._id) {
    await client.patch(hit._id).set({ trackingStatus: status }).commit()
    return { updatedId: hit._id }
  }
  // Otherwise, create a lightweight shipment doc so data isn't lost
  const doc = await client.createIfNotExists({
    _id: `shipment.${trackingNumber}`,
    _type: 'shipment',
    trackingNumber,
    trackingStatus: status,
  })
  return { createdId: doc._id }
}

const upsertLabel = async (client: SanityClient, labelId: string, data: any) => {
  const hit = await client.fetch('*[_type=="label" && labelId == $id][0]{_id}', { id: labelId })
  if (hit?._id) {
    await client.patch(hit._id).set({ ...data }).commit()
    return { updatedId: hit._id }
  }
  const doc = await client.createIfNotExists({
    _id: `label.${labelId}`,
    _type: 'label',
    labelId,
    ...data,
  })
  return { createdId: doc._id }
}

type ShipEngineEvent = {
  event?: string
  data?: any
  // common fields we might see
  tracking_number?: string
  label_id?: string
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    if (!checkToken(event)) {
      return { statusCode: 401, body: 'Unauthorized (bad webhook token)' }
    }

    const raw = event.body || '{}'
    let payload: ShipEngineEvent
      try {
        payload = JSON.parse(raw)
      } catch {
        return { statusCode: 400, body: 'Invalid JSON' }
      }

    const seEvent = (payload.event || '').toLowerCase()
    const client = await getSanity()

    const result: any = { ok: true, handled: seEvent || 'unknown' }

    // Handle a couple of common webhook types
    if (seEvent.includes('tracking')) {
      const tn = payload?.data?.tracking_number || payload.tracking_number
      if (tn && client) {
        result.tracking = await upsertTracking(client, tn, payload.data || payload)
      } else {
        result.note = 'No tracking number or Sanity credentials missing'
      }
    } else if (seEvent.includes('label') && seEvent.includes('created')) {
      const labelId = payload?.data?.label_id || payload.label_id
      if (labelId && client) {
        result.label = await upsertLabel(client, labelId, payload.data || payload)
      } else {
        result.note = 'No label id or Sanity credentials missing'
      }
    } else if (seEvent.includes('label') && seEvent.includes('void')) {
      const labelId = payload?.data?.label_id || payload.label_id
      if (labelId && client) {
        result.label = await upsertLabel(client, labelId, { voided: true, ...(payload.data || {}) })
      } else {
        result.note = 'No label id or Sanity credentials missing'
      }
    } else {
      // Unknown/other event: store a generic audit doc if we can
      if (client) {
        await client.createIfNotExists({
          _id: `shipengine.event.${Date.now()}`,
          _type: 'shipengineEvent',
          payload: payload,
          receivedAt: new Date().toISOString(),
        })
        result.note = 'Stored generic shipengineEvent doc'
      } else {
        result.note = 'Unhandled event; Sanity not configured'
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Webhook handling failed', error: error.message }),
    }
  }
}

