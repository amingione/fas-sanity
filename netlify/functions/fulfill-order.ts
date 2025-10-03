import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

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

    const fromAddress = {
      name: process.env.SHIP_FROM_NAME || 'F.A.S. Motorsports LLC',
      phone: process.env.SHIP_FROM_PHONE || '(812) 200-9012',
      address_line1: process.env.SHIP_FROM_ADDRESS1 || '6161 Riverside Dr',
      address_line2: process.env.SHIP_FROM_ADDRESS2 || undefined,
      city_locality: process.env.SHIP_FROM_CITY || 'Punta Gorda',
      state_province: process.env.SHIP_FROM_STATE || 'FL',
      postal_code: process.env.SHIP_FROM_POSTAL_CODE || '33982',
      country_code: process.env.SHIP_FROM_COUNTRY || 'US',
    }

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
      const carrierIds = Array.isArray(carriersJson) ? carriersJson.map((c: any) => c.carrier_id).filter(Boolean) : []

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
            service_code: serviceCode || 'usps_priority_mail',
            carrier_id: carrierId || undefined,
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
            customerName: to.name,
            invoiceId: orderId,
            products: Array.isArray(order.cart) ? order.cart : [],
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
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'orders@fasmotorsports.com',
            to: to.email,
            subject: 'Your FAS Motorsports Order Has Shipped!',
            html: `
              <h1>Your Order is on the Way!</h1>
              <p><strong>Tracking Number:</strong> ${createdLabels[0]?.tracking || ''}</p>
              <p><a href="${createdLabels[0]?.trackingUrl || '#'}">Track Your Package</a></p>
            `,
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
