import { createClient } from '@sanity/client'

// ---- Types ---------------------------------------------------------------
export type ShipEngineAddress = {
  name?: string
  address_line1?: string
  city_locality?: string
  state_province?: string
  postal_code?: string
  country_code?: string
  phone?: string
  email?: string
}

export type PackageDetails = {
  weight: { value: number; unit: 'pound' | 'ounce' }
  dimensions?: { unit: 'inch' | 'centimeter'; length?: number; width?: number; height?: number }
}

export interface CreateLabelInput {
  orderId: string
  serviceCode: string
  carrierId: string
  labelSize?: '4x6' | 'letter'
  ship_to: ShipEngineAddress
  ship_from: ShipEngineAddress
  package_details: PackageDetails
}

export interface CreateLabelResult {
  success: boolean
  labelUrl?: string
  trackingNumber?: string
  labelId?: string
  price?: number
  currency?: string
  estimatedDeliveryDate?: string | null
  error?: string
}

// ---- Sanity client (serverless endpoints should do the logging, but keep as fallback) ----
const sanityClient = createClient({
  projectId:
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    process.env.VITE_SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    'r4og35qd',
  dataset:
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    process.env.VITE_SANITY_STUDIO_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    'production',
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2023-01-01',
  useCdn: false,
})

async function fallbackLogToSanity(orderId: string, labelUrl?: string, trackingNumber?: string) {
  if (!labelUrl && !trackingNumber) return
  try {
    await sanityClient.create({
      _type: 'shippingLabel',
      order: { _type: 'reference', _ref: orderId },
      url: labelUrl,
      trackingNumber,
      createdAt: new Date().toISOString(),
    })
  } catch (e) {
    // best-effort only
    console.warn('Sanity log fallback failed:', (e as Error)?.message)
  }
}

// ---- Helper that calls your Netlify function ----------------------------
export async function createShippingLabel(input: CreateLabelInput): Promise<CreateLabelResult> {
  const res = await fetch('/.netlify/functions/createShippingLabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: input.orderId,
      serviceCode: input.serviceCode,
      carrier: input.carrierId,
      labelSize: input.labelSize ?? '4x6',
      ship_to: input.ship_to,
      ship_from: input.ship_from,
      package_details: input.package_details,
    }),
  })

  let data: CreateLabelResult
    try {
      data = (await res.json()) as CreateLabelResult
    } catch {
      return { success: false, error: 'Invalid JSON from label endpoint' }
    }

  if (!res.ok || !data?.success) {
    return { success: false, error: data?.error || 'Failed to create label' }
  }

  // Optional fallback log if serverless didn’t persist
  if (data.labelUrl || data.trackingNumber) {
    void fallbackLogToSanity(input.orderId, data.labelUrl, data.trackingNumber)
  }

  return data
}

// Convenience: small adapter to accept the JSON string saved by ShipEngineServiceInput
export function parseSelectedService(value: string | undefined | null): { serviceCode: string; carrierId: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed.serviceCode === 'string' && typeof parsed.carrierId === 'string') {
      return { serviceCode: parsed.serviceCode, carrierId: parsed.carrierId }
    }
  } catch {
    // ignore
  }
  return null
}