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
    .map((item: any) => {
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

async function createPackingSlip(netlifyBase: string, orderId: string, order: any) {
  const invoiceId = order?.invoiceRef?._ref || order?._id
  const res = await fetch(`${netlifyBase}/.netlify/functions/generatePackingSlips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      invoiceId: order?.invoiceRef?._ref || invoiceId,
    }),
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

    const pdfBase64 = await createPackingSlip(netlifyBase, orderId, order)

    await sanity
      .patch(orderId)
      .set({
        status: 'fulfilled',
        fulfilledAt: new Date().toISOString(),
        shippingCarrier: bestRate?.carrier || undefined,
      })
      .commit({ autoGenerateArrayKeys: true })

    const toEmail = order?.shippingAddress?.email || order?.customerEmail
    const orderNumber = order?.orderNumber || order?.stripeSessionId || orderId
    const customerName = order?.customerName || order?.shippingAddress?.name || (order?.customerEmail ? order.customerEmail.split('@')[0] : null) || 'there'
    const items = Array.isArray(order?.cart) ? order.cart : []
    const formatCurrency = (value?: number) => {
      return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : ''
    }
    const shippingLines = [
      order?.shippingAddress?.name,
      order?.shippingAddress?.addressLine1,
      order?.shippingAddress?.addressLine2,
      [order?.shippingAddress?.city, order?.shippingAddress?.state, order?.shippingAddress?.postalCode].filter(Boolean).join(', '),
      order?.shippingAddress?.country,
    ].filter((line) => Boolean(line && String(line).trim()))

    const itemsHtml = items.length
      ? `<table style="width:100%;border-collapse:collapse;margin:16px 0 24px;">
            <thead>
              <tr>
                <th style="text-align:left;font-size:13px;color:#4b5563;padding:0 0 8px;border-bottom:1px solid #e5e7eb;">Item</th>
                <th style="text-align:center;font-size:13px;color:#4b5563;padding:0 0 8px;border-bottom:1px solid #e5e7eb;width:70px;">Qty</th>
                <th style="text-align:right;font-size:13px;color:#4b5563;padding:0 0 8px;border-bottom:1px solid #e5e7eb;width:90px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map((item: any) => `
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                      <div style="font-size:14px;color:#0f172a;font-weight:600;">${item?.name || item?.sku || 'Item'}</div>
                      ${item?.sku ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">SKU ${item.sku}</div>` : ''}
                    </td>
                    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#1f2937;">${Number(item?.quantity || 1)}</td>
                    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#1f2937;">${formatCurrency(Number(item?.price))}</td>
                  </tr>
                `)
                .join('')}
            </tbody>
          </table>`
      : ''

    const shippingHtml = shippingLines.length
      ? `<div style="margin:24px 0 12px;">
            <h3 style="margin:0 0 6px;font-size:15px;color:#0f172a;">Shipping to</h3>
            <div style="font-size:14px;color:#334155;line-height:1.5;">
              ${shippingLines.map((line) => `<div>${line}</div>`).join('')}
            </div>
          </div>`
      : ''

    const trackingButton = trackingUrl
      ? `<a href="${trackingUrl}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#ffffff;font-weight:600;text-decoration:none;border-radius:8px;margin:0 0 12px;">Track Your Package</a>`
      : ''

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px;">
          <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.12);">
            <div style="background:#0f172a;color:#ffffff;padding:24px 28px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Your order${
                orderNumber ? ` <span style="color:#f97316">#${orderNumber}</span>` : ''
              } is on the way!</h1>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.75);">Hi ${customerName}, thanks for shopping with F.A.S. Motorsports.</p>
          </div>
          <div style="padding:28px 28px 8px;color:#0f172a;">
            <p style="margin:0 0 14px;font-size:15px;">We’ve generated a shipping label and handed your package to the carrier.</p>
            <div style="padding:16px 20px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;margin:0 0 18px;">
              <p style="margin:0;font-size:14px;color:#475569;">Tracking number</p>
              <p style="margin:6px 0 0;font-size:18px;font-weight:600;color:#0f172a;">${trackingNumber}</p>
              ${trackingUrl ? `<p style="margin:12px 0 0;">${trackingButton}</p>` : ''}
            </div>
            ${itemsHtml}
            ${shippingHtml}
            <div style="margin:28px 0 0;padding:18px 20px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;">
              We’ll email you again if anything changes. Need a hand? Reply to this message or call us at (812) 200-9012.
            </div>
          </div>
          <div style="padding:18px 28px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">
            F.A.S. Motorsports LLC • 6161 Riverside Dr • Punta Gorda, FL 33982
          </div>
        </div>
      </div>
    `

    const textItems = items.length
      ? items
          .map((item: any) => `- ${Number(item?.quantity || 1)} × ${item?.name || item?.sku || 'Item'} ${formatCurrency(Number(item?.price))}`)
          .join('\n')
      : '- (details unavailable)'

    const text = `Hi ${customerName},\n\nYour order${orderNumber ? ` #${orderNumber}` : ''} is on the way!\nTracking number: ${trackingNumber}${trackingUrl ? `\nTrack your package: ${trackingUrl}` : ''}\n\nItems:\n${textItems}` +
      (shippingLines.length ? `\n\nShipping to:\n${shippingLines.join('\n')}` : '') +
      `\n\nIf you have any questions, reply to this email or call us at (812) 200-9012.\n\n— F.A.S. Motorsports`

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
          subject: `Your FAS Motorsports Order${orderNumber ? ` #${orderNumber}` : ''} Has Shipped!`,
          html,
          text,
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
