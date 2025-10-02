import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const SANITY_PROJECT_ID =
  process.env.SANITY_PROJECT_ID ||
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.VITE_SANITY_STUDIO_PROJECT_ID ||
  'r4og35qd';
const SANITY_DATASET =
  process.env.SANITY_DATASET ||
  process.env.SANITY_STUDIO_DATASET ||
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  process.env.VITE_SANITY_STUDIO_DATASET ||
  'production';
const SANITY_TOKEN = process.env.SANITY_API_TOKEN!;

const DEFAULT_PACKAGE = {
  weight: { value: Number(process.env.DEFAULT_PACKAGE_WEIGHT_LBS || 5), unit: 'pound' as const },
  dimensions: {
    unit: 'inch' as const,
    length: Number(process.env.DEFAULT_PACKAGE_LENGTH_IN || 12),
    width: Number(process.env.DEFAULT_PACKAGE_WIDTH_IN || 9),
    height: Number(process.env.DEFAULT_PACKAGE_HEIGHT_IN || 4),
  },
}

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-10-01',
  token: SANITY_TOKEN,
  useCdn: false,
})

function resolveNetlifyBase(): string {
  const candidates = [
    process.env.NETLIFY_FUNCTIONS_BASE,
    process.env.NETLIFY_BASE_URL,
    process.env.SANITY_STUDIO_NETLIFY_BASE,
    'https://fassanity.fasmotorsports.com',
  ]

  for (const candidate of candidates) {
    if (candidate && /^https?:\/\//i.test(candidate)) {
      return candidate.replace(/\/$/, '')
    }
  }

  return 'https://fassanity.fasmotorsports.com'
}

function mapCart(items: any[]): Array<{ sku: string; quantity: number }> {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      const sku = (item?.sku || '').toString().trim()
      const quantity = Number(item?.quantity || 1)
      if (!sku) return null
      return { sku, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 }
    })
    .filter((entry): entry is { sku: string; quantity: number } => Boolean(entry))
}

function buildDestination(address: any) {
  if (!address) return null
  return {
    name: address.name || undefined,
    phone: address.phone || undefined,
    email: address.email || undefined,
    addressLine1: address.addressLine1 || undefined,
    addressLine2: address.addressLine2 || undefined,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postalCode || undefined,
    country: address.country || undefined,
  }
}

function pickPackage(packages: any[] | undefined | null) {
  if (Array.isArray(packages) && packages.length > 0) {
    const first = packages[0]
    const weight = first?.weight && typeof first.weight === 'object' ? first.weight : undefined
    const dimensions = first?.dimensions && typeof first.dimensions === 'object' ? first.dimensions : undefined
    if (weight && Number(weight.value) > 0 && dimensions && Number(dimensions.length) > 0) {
      return { weight, dimensions }
    }
  }
  return DEFAULT_PACKAGE
}

async function createPackingSlip(netlifyBase: string, order: any) {
  const customerName = order?.shippingAddress?.name || order?.customerEmail || 'Customer'
  const invoiceId = order?.invoiceRef?._ref || order?._id
  const products = Array.isArray(order?.cart)
    ? order.cart.map((item: any) => ({
        name: item?.name || item?.sku || 'Item',
        quantity: Number(item?.quantity || 1) || 1,
      }))
    : []

  const res = await fetch(`${netlifyBase}/.netlify/functions/generatePackingSlips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName, invoiceId, products }),
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer.toString('base64')
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { orderId } = await request.json()

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), { status: 400 })
    }

    const order = await sanity.fetch(
      `*[_type == "order" && _id == $id][0]{
        _id,
        cart,
        customerEmail,
        shippingAddress,
        invoiceRef,
        shippingLabelUrl,
        trackingNumber
      }`,
      { id: orderId }
    )

    if (!order || !order.shippingAddress) {
      return new Response(JSON.stringify({ error: 'Invalid or missing order or shipping address' }), { status: 400 })
    }

    if (order.trackingNumber && order.shippingLabelUrl) {
      return new Response(JSON.stringify({ success: true, reused: true, trackingNumber: order.trackingNumber }), { status: 200 })
    }

    const netlifyBase = resolveNetlifyBase()
    const destination = buildDestination(order.shippingAddress)
    const cart = mapCart(order.cart || [])

    if (!destination || !destination.addressLine1 || !destination.postalCode || !destination.country) {
      return new Response(JSON.stringify({ error: 'Incomplete destination address for label generation' }), { status: 400 })
    }

    if (cart.length === 0) {
      return new Response(JSON.stringify({ error: 'Order is missing cart items with SKUs' }), { status: 400 })
    }

    const quoteRes = await fetch(`${netlifyBase}/.netlify/functions/getShippingQuoteBySkus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart, destination }),
    })

    const quoteData = await quoteRes.json().catch(() => ({}))
    if (!quoteRes.ok || quoteData?.error) {
      throw new Error(typeof quoteData?.error === 'string' ? quoteData.error : 'Failed to fetch shipping rates')
    }

    if (quoteData?.freight) {
      return new Response(JSON.stringify({ error: 'Freight shipment required. Manual handling needed.', freight: true }), { status: 409 })
    }

    const bestRate = quoteData?.bestRate || (Array.isArray(quoteData?.rates) ? quoteData.rates[0] : null)
    if (!bestRate || !bestRate.serviceCode) {
      return new Response(JSON.stringify({ error: 'No shipping rates available for this order' }), { status: 502 })
    }

    const pkg = pickPackage(quoteData?.packages)

    const labelPayload: Record<string, any> = {
      orderId,
      labelSize: '4x6',
      serviceCode: bestRate.serviceCode,
      carrier: bestRate.carrierId || undefined,
      weight: pkg.weight,
      dimensions: pkg.dimensions,
    }

    const labelRes = await fetch(`${netlifyBase}/.netlify/functions/createShippingLabel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(labelPayload),
    })

    const labelData = await labelRes.json().catch(() => ({}))
    if (!labelRes.ok || labelData?.error) {
      throw new Error(typeof labelData?.error === 'string' ? labelData.error : 'Failed to create shipping label')
    }

    const trackingNumber = labelData?.trackingNumber || labelData?.tracking_number
    const trackingUrl = labelData?.trackingUrl || labelData?.tracking_url || null
    const labelUrl = labelData?.labelUrl || labelData?.label_download?.pdf || null

    if (!trackingNumber || !labelUrl) {
      throw new Error('Shipping label response missing tracking number or label URL')
    }

    const pdfBase64 = await createPackingSlip(netlifyBase, order)

    await sanity
      .patch(orderId)
      .set({
        status: 'fulfilled',
        fulfilledAt: new Date().toISOString(),
        shippingCarrier: bestRate?.carrier || undefined,
      })
      .commit({ autoGenerateArrayKeys: true })

    const toEmail = order?.shippingAddress?.email || order?.customerEmail
    if (toEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'orders@fasmotorsports.com',
          to: toEmail,
          subject: 'Your FAS Motorsports Order Has Shipped!',
          html: `
            <h1>Your order is on the way!</h1>
            <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
            ${trackingUrl ? `<p><a href="${trackingUrl}">Track your package</a></p>` : ''}
          `,
          attachments: [
            {
              filename: 'PackingSlip.pdf',
              content: pdfBase64,
              contentType: 'application/pdf',
            },
          ],
        }),
      })
    }

    return new Response(
      JSON.stringify({ success: true, trackingNumber, trackingUrl, labelUrl, rate: bestRate }),
      { status: 200 }
    )
  } catch (err: any) {
    console.error('Error fulfilling order:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), { status: 500 })
  }
}
