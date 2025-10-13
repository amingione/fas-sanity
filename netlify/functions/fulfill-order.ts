import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { getShipEngineFromAddress } from '../lib/ship-from'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY || ''
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

function makeBaseUrl(): string | null {
  const base = (
    process.env.SANITY_STUDIO_NETLIFY_BASE ||
    process.env.PUBLIC_SITE_URL ||
    process.env.AUTH0_BASE_URL ||
    ''
  ).trim()
  return base && base.startsWith('http') ? base.replace(/\/$/, '') : null
}

const ORDER_NUMBER_PREFIX = 'FAS'

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function orderNumberFromSessionId(id?: string | null): string | undefined {
  if (!id) return undefined
  const core = id.toString().trim().replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function formatOrderNumberForDisplay(opts: { orderNumber?: string | null; stripeSessionId?: string | null; fallbackId?: string | null }): string | undefined {
  return (
    sanitizeOrderNumber(opts.orderNumber) ||
    orderNumberFromSessionId(opts.stripeSessionId) ||
    sanitizeOrderNumber(opts.fallbackId) ||
    undefined
  )
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' }
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

    const { orderId } = JSON.parse(event.body || '{}')
    if (!orderId) return { statusCode: 400, body: 'Missing orderId' }

    const order = await sanity.fetch(`*[_type == "order" && _id == $id][0]`, { id: orderId })
    if (!order || !order.shippingAddress) {
      return { statusCode: 400, body: 'Invalid or missing order or shipping address' }
    }

    const to = order.shippingAddress
    const toAddress = {
      name: to.name,
      phone: to.phone,
      address_line1: to.addressLine1,
      address_line2: to.addressLine2,
      city_locality: to.city,
      state_province: to.state,
      postal_code: to.postalCode,
      country_code: to.country,
    }

    const fromAddress = getShipEngineFromAddress()

    // Compute package plan from product data (weights/dims)
    type CartItem = { sku?: string; name?: string; quantity?: number }
    const cart: CartItem[] = Array.isArray(order.cart) ? order.cart : []

    function parseDims(s?: string): { length: number; width: number; height: number; unit: 'inch' } | null {
      if (!s) return null
      const m = String(s).match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
      if (!m) return null
      const [ , L, W, H ] = m
      return { length: Number(L), width: Number(W), height: Number(H), unit: 'inch' as const }
    }

    const skus = cart.map(c => (c?.sku || '').trim()).filter(Boolean)
    const titles = cart.map(c => (c?.name || '').trim()).filter(Boolean)

    // fetch matching products by sku or title
    const products: any[] = await sanity.fetch(
      `*[_type == "product" && (sku in $skus || title in $titles)]{_id, title, sku, shippingWeight, boxDimensions, shipsAlone, shippingClass}`,
      { skus, titles }
    )

    const defaultDims = {
      unit: 'inch' as const,
      length: Number(process.env.DEFAULT_PACKAGE_LENGTH_IN || 12),
      width: Number(process.env.DEFAULT_PACKAGE_WIDTH_IN || 9),
      height: Number(process.env.DEFAULT_PACKAGE_HEIGHT_IN || 4),
    }

    let combinedWeight = 0
    let maxDims = { ...defaultDims }
    let hasShipsAlone = false
    let freightRequired = false
    let shippableCount = 0
    const installOnlySkus: string[] = []
    const soloPackages: Array<{ weight: number; dims: typeof defaultDims; sku?: string; title?: string }> = []

    const isInstallOnlyClass = (value?: string) => typeof value === 'string' && value.trim().toLowerCase().startsWith('install')

    function findProd(ci: CartItem) {
      if (!products || products.length === 0) return null
      if (ci.sku) {
        const bySku = products.find(p => p?.sku === ci.sku)
        if (bySku) return bySku
      }
      if (ci.name) {
        const byTitle = products.find(p => p?.title === ci.name)
        if (byTitle) return byTitle
      }
      return null
    }

    for (const ci of cart) {
      const qty = Number(ci?.quantity || 1)
      const prod = findProd(ci)
      const weight = Number(prod?.shippingWeight || 0)
      const dims = parseDims(prod?.boxDimensions || '') || null
      const shipsAlone = Boolean(prod?.shipsAlone)
      const shippingClass = (prod?.shippingClass || '').toString()
      const installOnly = isInstallOnlyClass(shippingClass)

      if (installOnly) {
        const sku = (ci?.sku || prod?.sku || '').toString()
        if (sku && !installOnlySkus.includes(sku)) installOnlySkus.push(sku)
        continue
      }

      shippableCount += 1

      // Freight rules: explicit shippingClass == 'Freight' OR heavy/bulky packages
      if (/^freight$/i.test(shippingClass)) freightRequired = true
      const anyDim = dims ? Math.max(dims.length, dims.width, dims.height) : 0
      const totalPieceWeight = weight * qty
      if (weight >= 70 || anyDim >= 60 || totalPieceWeight >= 150) {
        freightRequired = true
      }

      if (shipsAlone) hasShipsAlone = true

      if (weight > 0) {
        if (shipsAlone) {
          for (let i = 0; i < qty; i++) {
            soloPackages.push({ weight, dims: dims || defaultDims, sku: ci.sku, title: ci.name })
          }
        } else {
          combinedWeight += weight * qty
          if (dims) {
            maxDims.length = Math.max(maxDims.length, dims.length)
            maxDims.width = Math.max(maxDims.width, dims.width)
            maxDims.height = Math.max(maxDims.height, dims.height)
          }
        }
      }
    }

    if (shippableCount === 0) {
      try {
        await sanity.patch(orderId)
          .setIfMissing({ shippingLog: [] })
          .append('shippingLog', [
            {
              _type: 'shippingLogEntry',
              status: 'install_only',
              message: 'Order contains install-only items — no shipping label required.',
              createdAt: new Date().toISOString(),
            },
          ])
          .commit({ autoGenerateArrayKeys: true })
      } catch (e) {
        console.warn('fulfill-order: failed to log install-only status', e)
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, installOnly: true, message: 'Install-only order. Schedule installation instead of shipping.', installOnlySkus }),
      }
    }

    // If no weights resolved at all, fall back to defaults
    if (combinedWeight === 0 && soloPackages.length === 0) {
      combinedWeight = Number(process.env.DEFAULT_PACKAGE_WEIGHT_LBS || 5)
    }

    // Build packages array
    const packages: Array<{ weight: { value: number; unit: 'pound' }; dimensions: typeof defaultDims; sku?: string; title?: string }> = []
    if (combinedWeight > 0) {
      packages.push({ weight: { value: combinedWeight, unit: 'pound' }, dimensions: maxDims })
    }
    for (const p of soloPackages) {
      packages.push({ weight: { value: p.weight, unit: 'pound' }, dimensions: p.dims, sku: p.sku, title: p.title })
    }

    // If freight is required, log and bail for manual handling
    if (freightRequired) {
      await sanity.patch(orderId)
        .setIfMissing({ shippingLog: [] })
        .append('shippingLog', [
          {
            _type: 'shippingLogEntry',
            status: 'needs_freight_quote',
            message: 'Freight required due to weight/dimensions or product class.',
            createdAt: new Date().toISOString(),
            weight: combinedWeight || (soloPackages[0]?.weight ?? 0),
          },
        ])
        .commit({ autoGenerateArrayKeys: true })

      // Open a freight quote task in Studio
      try {
        const baseUrl = makeBaseUrl()
        if (baseUrl) {
          await fetch(`${baseUrl}/.netlify/functions/requestFreightQuote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
          })
        }
      } catch (e) {
        console.warn('fulfill-order: requestFreightQuote failed', e)
      }

      return { statusCode: 200, body: JSON.stringify({ success: true, freight: true }) }
    }

    // Choose service
    const FALLBACK_CARRIER_IDS = ['se-2300833', 'se-2945844', 'se-2300834'] // UPS, FedEx, GlobalPost
    const FALLBACK_SERVICE_CODES = ['ups_ground', 'ups_2nd_day_air', 'fedex_ground', 'fedex_express_saver', 'globalpost_priority']

    let serviceCode = process.env.SHIPENGINE_SERVICE_CODE || process.env.DEFAULT_SHIPENGINE_SERVICE_CODE || ''
    let carrierId = process.env.SHIPENGINE_CARRIER_ID || process.env.DEFAULT_SHIPENGINE_CARRIER_ID || ''
    const looksLikeCarrierId = (s?: string) => typeof s === 'string' && /[a-f0-9]{8}-[a-f0-9]{4}-/.test(s)
    if (!looksLikeCarrierId(carrierId)) carrierId = ''

    if (!serviceCode || !carrierId) {
      // Try to discover active carriers
      const carriersResp = await fetch('https://api.shipengine.com/v1/carriers', {
        headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
      })
      const carriersJson: any = await carriersResp.json().catch(() => null)
      const carrierIds = Array.isArray(carriersJson) ? carriersJson
        .map((c: any) => c.carrier_id)
        .filter((id: string | undefined) => FALLBACK_CARRIER_IDS.includes(id || ''))
        : FALLBACK_CARRIER_IDS

      // Get rate options via /v1/rates with shipment-style payload
      const ratesResp = await fetch('https://api.shipengine.com/v1/rates', {
        method: 'POST',
        headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_options: { carrier_ids: carrierIds },
          shipment: {
            ship_to: toAddress,
            ship_from: fromAddress,
            packages,
          },
        }),
      })
      const ratesJson: any = await ratesResp.json().catch(() => null)
      const ratesArr: any[] = Array.isArray(ratesJson?.rate_response?.rates) ? ratesJson.rate_response.rates : []
      if (ratesArr.length > 0) {
        // Pick the cheapest
        ratesArr.sort((a, b) => Number(a?.shipping_amount?.amount || 0) - Number(b?.shipping_amount?.amount || 0))
        serviceCode = ratesArr[0]?.service_code || serviceCode
        carrierId = ratesArr[0]?.carrier_id || carrierId
      }
    }

    // Create label(s). If multiple packages, create one label per package and log each.
    const createdLabels: Array<{ url?: string; tracking?: string; trackingUrl?: string; weight?: number; dims?: any; sku?: string; title?: string }> = []
    for (let i = 0; i < packages.length; i++) {
      const pack = packages[i]
      const labelRes = await fetch('https://api.shipengine.com/v1/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': SHIPENGINE_API_KEY,
        },
        body: JSON.stringify({
          shipment: {
            service_code: serviceCode || FALLBACK_SERVICE_CODES[0],
            carrier_id: carrierId || FALLBACK_CARRIER_IDS[0],
            ship_to: toAddress,
            ship_from: fromAddress,
            packages: [pack],
          },
          label_format: 'pdf',
          label_download_type: 'url',
          external_order_id: `${orderId}#${i + 1}`,
        }),
      })
      const labelData = await labelRes.json()
      if (!labelRes.ok) {
        console.error('ShipEngine label error:', labelData)
        continue
      }

      const url = labelData?.label_download?.pdf || labelData?.label_download?.href
      const tracking = labelData?.tracking_number
      const trackingUrl = labelData?.tracking_url
      createdLabels.push({ url, tracking, trackingUrl, weight: pack.weight?.value, dims: pack.dimensions, sku: pack.sku, title: pack.title })
    }

    if (createdLabels.length === 0) {
      return { statusCode: 500, body: 'Failed to generate any labels' }
    }

    // Generate packing slip via our function
    const baseUrl = makeBaseUrl()
    let pdfBase64 = ''
    if (baseUrl) {
      try {
        const psRes = await fetch(`${baseUrl}/.netlify/functions/generatePackingSlips`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            invoiceId: order?.invoiceRef?._ref || undefined,
          }),
        })
        if (psRes.ok) {
          pdfBase64 = await psRes.text()
        }
      } catch (e) {
        console.warn('Packing slip generation failed:', e)
      }
    }

    // If we got a PDF, upload as Sanity asset and record URL
    let packingSlipUrl: string | undefined
    if (pdfBase64) {
      try {
        const clean = pdfBase64.replace(/^\"|\"$/g, '')
        const buf = Buffer.from(clean, 'base64')
        const asset = await sanity.assets.upload('file', buf, {
          filename: `packing-slip-${orderId}.pdf`,
          contentType: 'application/pdf',
        })
        packingSlipUrl = (asset as any)?.url
      } catch (e) {
        console.warn('Failed to upload packing slip asset:', e)
      }
    }

    // Build shippingLog entries for each label
    const logEntries = createdLabels.map((L, idx) => ({
      _type: 'shippingLogEntry',
      status: 'label_created',
      message: `Package ${idx + 1}/${createdLabels.length}${L.title ? ` • ${L.title}` : ''}${L.sku ? ` • SKU ${L.sku}` : ''}`,
      labelUrl: L.url,
      trackingUrl: L.trackingUrl,
      trackingNumber: L.tracking,
      weight: Number(L.weight || 0),
      createdAt: new Date().toISOString(),
    }))

    // Update order in Sanity
    await sanity.patch(orderId)
      .set({
        shippingLabelUrl: createdLabels[0]?.url,
        trackingNumber: createdLabels[0]?.tracking,
        ...(packingSlipUrl ? { packingSlipUrl } : {}),
        status: 'fulfilled',
        fulfilledAt: new Date().toISOString(),
      })
      .setIfMissing({ shippingLog: [] })
      .append('shippingLog', logEntries)
      .commit({ autoGenerateArrayKeys: true })

    // Optional: send email via Resend
    if (RESEND_API_KEY && to?.email) {
      try {
        const orderNumber = formatOrderNumberForDisplay({
          orderNumber: order.orderNumber,
          stripeSessionId: order.stripeSessionId,
          fallbackId: (order as any)?._id || orderId,
        })

        const rawName = (
          order.customerName ||
          order.shippingAddress?.name ||
          (order.customerEmail ? order.customerEmail.split('@')[0] : '') ||
          ''
        ).toString()
        const trimmedName = rawName.trim()
        const greetingLine = trimmedName
          ? `Hi ${trimmedName}, we just handed your package to the carrier.`
          : 'We just handed your package to the carrier.'
        const salutationPlain = trimmedName ? `Hi ${trimmedName}` : 'Hi there'

        const items = Array.isArray(order.cart) ? order.cart : []
        const formatCurrency = (value?: number) => {
          return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : ''
        }
        const shippingLines = [
          order.shippingAddress?.name,
          order.shippingAddress?.addressLine1,
          order.shippingAddress?.addressLine2,
          [order.shippingAddress?.city, order.shippingAddress?.state, order.shippingAddress?.postalCode].filter(Boolean).join(', '),
          order.shippingAddress?.country,
        ].filter((line) => Boolean(line && String(line).trim()))

        const itemsHtml = items.length
          ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;">
              <thead>
                <tr>
                  <th align="left" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;">Item</th>
                  <th align="center" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;width:70px;">Qty</th>
                  <th align="right" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;width:90px;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map((item: any) => `
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                        <div style="font-size:14px;color:#111827;font-weight:600;">${item?.name || item?.sku || 'Item'}</div>
                        ${item?.sku ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">SKU ${item.sku}</div>` : ''}
                      </td>
                      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#374151;">${Number(item?.quantity || 1)}</td>
                      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#374151;">${formatCurrency(Number(item?.price))}</td>
                    </tr>
                  `)
                  .join('')}
              </tbody>
            </table>`
          : ''

        const shippingHtml = shippingLines.length
          ? `<div style="margin:24px 0 12px;">
                <h3 style="margin:0 0 6px;font-size:15px;color:#111827;">Shipping to</h3>
                <div style="font-size:14px;color:#374151;line-height:1.5;">
                  ${shippingLines.map((line) => `<div>${line}</div>`).join('')}
                </div>
              </div>`
          : ''

        const primaryLabel = createdLabels[0] || {}
        const trackingNumber = primaryLabel?.tracking ? String(primaryLabel.tracking) : ''
        const trackingUrl = primaryLabel?.trackingUrl ? String(primaryLabel.trackingUrl) : undefined

        const trackingHtml = trackingNumber
          ? `<div style="margin:0 0 18px;padding:16px 20px;border:1px solid #e4e4e7;border-radius:12px;background:#f9fafb;">
                <p style="margin:0;font-size:13px;color:#52525b;">Tracking number</p>
                <p style="margin:6px 0 0;font-size:18px;font-weight:600;color:#111827;">${trackingNumber}</p>
                ${trackingUrl ? `<p style="margin:12px 0 0;"><a href="${trackingUrl}" style="display:inline-block;padding:12px 18px;background:#dc2626;color:#ffffff;font-weight:600;text-decoration:none;border-radius:6px;">Track your package</a></p>` : ''}
              </div>`
          : `<div style="margin:0 0 18px;padding:16px 20px;border:1px solid #e4e4e7;border-radius:12px;background:#f9fafb;font-size:14px;color:#52525b;">Your label is ready and tracking details will be shared shortly.</div>`

        const html = `
          <div style="margin:0;padding:24px 12px;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#0f172a;color:#ffffff;padding:24px 28px;">
                  <h1 style="margin:0;font-size:22px;font-weight:700;">${orderNumber ? `Order <span style=\"color:#f97316\">#${orderNumber}</span>` : 'Your order'} is on the way</h1>
                  <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">${greetingLine}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 28px 24px;color:#111827;">
                  <p style="margin:0 0 16px;font-size:15px;">Good news—your order is moving. You can keep an eye on it using the details below.</p>
                  ${trackingHtml}
                  ${itemsHtml}
                  ${shippingHtml}
                  <div style="margin:28px 0 0;padding:16px 20px;border-radius:10px;background:#f9fafb;color:#4b5563;font-size:13px;border:1px solid #e4e4e7;">
                    Need anything? Reply to this email or call us at (812) 200-9012 and we’ll be happy to help.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px;border-top:1px solid #e4e4e7;background:#f4f4f5;font-size:12px;color:#6b7280;text-align:center;">
                  F.A.S. Motorsports LLC • 6161 Riverside Dr • Punta Gorda, FL 33982
                </td>
              </tr>
            </table>
          </div>
        `

        const textItems = items
          .map((item: any) => `- ${Number(item?.quantity || 1)} × ${item?.name || item?.sku || 'Item'} ${formatCurrency(Number(item?.price))}`)
          .join('\n') || '- (details unavailable)'

        const textLines: string[] = []
        textLines.push(`${salutationPlain},`)
        textLines.push('')
        textLines.push(`Good news—your order${orderNumber ? ` #${orderNumber}` : ''} is on its way.`)
        if (trackingNumber) textLines.push(`Tracking number: ${trackingNumber}`)
        if (trackingUrl) textLines.push(`Track your package: ${trackingUrl}`)
        textLines.push('')
        textLines.push('Items:')
        textLines.push(textItems)
        if (shippingLines.length) {
          textLines.push('')
          textLines.push('Shipping to:')
          textLines.push(shippingLines.join('\n'))
        }
        textLines.push('')
        textLines.push('Need anything? Reply to this email or call (812) 200-9012.')
        textLines.push('')
        textLines.push('— F.A.S. Motorsports')

        const text = textLines.join('\n')

        const subject = orderNumber
          ? `Your F.A.S. Motorsports Order #${orderNumber} Is On The Way`
          : 'Your F.A.S. Motorsports Order Is On The Way'

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'orders@fasmotorsports.com',
            to: to.email,
            subject,
            html,
            text,
            attachments: pdfBase64
              ? [
                  {
                    filename: 'PackingSlip.pdf',
                    content: pdfBase64,
                    contentType: 'application/pdf',
                  },
                ]
              : [],
          }),
        })
      } catch (e) {
        console.warn('Resend email failed:', e)
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err: any) {
    console.error('fulfill-order error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || 'Server error' }) }
  }
}

export default handler
