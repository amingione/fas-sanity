// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {randomUUID} from 'crypto'
import {getMissingResendFields} from '../lib/resendValidation'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})
const resendApiKey = resolveResendApiKey()
const resend = resendApiKey ? new Resend(resendApiKey) : null

function parseDims(
  s?: string,
): {length: number; width: number; height: number; unit: 'inch'} | null {
  if (!s) return null
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
  if (!m) return null
  const [, L, W, H] = m
  return {length: Number(L), width: Number(W), height: Number(H), unit: 'inch' as const}
}

const isInstallOnlyClass = (value?: string) =>
  typeof value === 'string' && value.trim().toLowerCase().startsWith('install')

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST')
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }

  type Dest = {
    name?: string
    phone?: string
    email?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  type CartItem = {sku?: string; name?: string; quantity?: number}

  let body: any = {}
  let reservationLogId: string | undefined
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const orderId = (body?.orderId || '').trim()
  const destination: Dest | null = body?.destination || null
  const cart: CartItem[] = Array.isArray(body?.cart) ? body.cart : []
  const contactName: string | undefined = body?.contactName
  const contactEmail: string | undefined = body?.contactEmail
  const contactPhone: string | undefined = body?.contactPhone

  let order: any = null
  let dest: Dest | null = destination
  let items: CartItem[] = cart
  let invoiceRef: any = null
  let customerRef: any = null

  if (orderId) {
    order = await sanity.fetch(
      `*[_type == "order" && _id == $id][0]{
      _id, orderNumber, customerEmail, customerRef, invoiceRef, shippingAddress, cart
    }`,
      {id: orderId},
    )
    if (order) {
      invoiceRef = order?.invoiceRef || null
      customerRef = order?.customerRef || null
      dest =
        dest ||
        (order?.shippingAddress
          ? {
              name: order.shippingAddress.name,
              phone: order.shippingAddress.phone,
              email: order.shippingAddress.email,
              addressLine1: order.shippingAddress.addressLine1,
              addressLine2: order.shippingAddress.addressLine2,
              city: order.shippingAddress.city,
              state: order.shippingAddress.state,
              postalCode: order.shippingAddress.postalCode,
              country: order.shippingAddress.country,
            }
          : null)
      items = items && items.length > 0 ? items : Array.isArray(order?.cart) ? order.cart : []
    }
  }

  if (!dest)
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing destination'}),
    }
  if (!Array.isArray(items) || items.length === 0)
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing cart items'}),
    }

  const skus = items.map((i) => (i?.sku || '').trim()).filter(Boolean)
  const titles = items.map((i) => (i?.name || '').trim()).filter(Boolean)
  const products: any[] = await sanity.fetch(
    `*[_type == "product" && (sku in $skus || title in $titles)]{
      _id,
      title,
      sku,
      productType,
      shippingWeight,
      boxDimensions,
      shipsAlone,
      shippingClass,
      coreRequired,
      promotionTagline
    }`,
    {skus, titles},
  )

  const defaultDims = {
    unit: 'inch' as const,
    length: Number(process.env.DEFAULT_PACKAGE_LENGTH_IN || 12),
    width: Number(process.env.DEFAULT_PACKAGE_WIDTH_IN || 9),
    height: Number(process.env.DEFAULT_PACKAGE_HEIGHT_IN || 4),
  }

  let combinedWeight = 0
  let maxDims = {...defaultDims}
  let freightRequired = false
  let shippableCount = 0
  const installOnlySkus: string[] = []
  const soloPackages: Array<{
    weight: number
    dims: typeof defaultDims
    sku?: string
    title?: string
  }> = []

  function findProd(ci: CartItem) {
    if (ci?.sku) {
      const bySku = products.find((p) => p?.sku === ci.sku)
      if (bySku) return bySku
    }
    if (ci?.name) {
      const byTitle = products.find((p) => p?.title === ci.name)
      if (byTitle) return byTitle
    }
    return null
  }

  for (const ci of items) {
    const qty = Number(ci?.quantity || 1)
    const prod = findProd(ci)
    if ((prod?.productType || '').toLowerCase() === 'service') {
      const sku = (prod?.sku || ci?.sku || '').toString()
      if (sku && !installOnlySkus.includes(sku)) installOnlySkus.push(sku)
      continue
    }
    const weight = Number(prod?.shippingWeight || 0)
    const dims = parseDims(prod?.boxDimensions || '') || null
    const shipsAlone = Boolean(prod?.shipsAlone)
    const shippingClass = (prod?.shippingClass || '').toString()
    const installOnly = isInstallOnlyClass(shippingClass)

    if (installOnly) {
      const sku = (prod?.sku || ci?.sku || '').toString()
      if (sku && !installOnlySkus.includes(sku)) installOnlySkus.push(sku)
      continue
    }

    shippableCount += 1

    if (/^freight$/i.test(shippingClass)) freightRequired = true
    const anyDim = dims ? Math.max(dims.length, dims.width, dims.height) : 0
    const totalPieceWeight = weight * qty
    if (weight >= 70 || anyDim >= 60 || totalPieceWeight >= 150) freightRequired = true

    if (weight > 0) {
      if (shipsAlone) {
        for (let i = 0; i < qty; i++)
          soloPackages.push({weight, dims: dims || defaultDims, sku: ci.sku, title: ci.name})
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
    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        freight: false,
        installOnly: true,
        message: 'All items are install-only; no freight quote required.',
        installOnlySkus,
      }),
    }
  }

  if (!freightRequired) {
    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({freight: false, message: 'No freight required'}),
    }
  }

  const packages = [] as Array<{
    weight: {value: number; unit: 'pound'}
    dimensions: {length: number; width: number; height: number; unit: 'inch'}
  }>
  if (combinedWeight > 0)
    packages.push({weight: {value: combinedWeight, unit: 'pound'}, dimensions: maxDims})
  for (const p of soloPackages)
    packages.push({weight: {value: p.weight, unit: 'pound'}, dimensions: p.dims})

  const orderNumberLabel = typeof order?.orderNumber === 'string' ? order.orderNumber : ''
  const doc: any = {
    _type: 'freightQuote',
    status: 'open',
    title: orderNumberLabel
      ? `Freight Quote for Order ${orderNumberLabel}`
      : orderId
        ? `Freight Quote for Order ${orderId.slice(-6)}`
        : 'Freight Quote',
    orderRef: orderId ? {_type: 'reference', _ref: orderId} : undefined,
    invoiceRef: invoiceRef || undefined,
    customerRef: customerRef || undefined,
    contactName: contactName || dest?.name || undefined,
    contactEmail: contactEmail || order?.customerEmail || undefined,
    contactPhone: contactPhone || dest?.phone || undefined,
    destination: {
      name: dest?.name || '',
      phone: dest?.phone || '',
      email: dest?.email || order?.customerEmail || '',
      addressLine1: dest?.addressLine1 || '',
      addressLine2: dest?.addressLine2 || '',
      city: dest?.city || '',
      state: dest?.state || '',
      postalCode: dest?.postalCode || '',
      country: dest?.country || '',
    },
    cart: items.map((i) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      sku: i?.sku || '',
      name: i?.name || '',
      quantity: Number(i?.quantity || 1),
    })),
    packages: packages.map((p) => ({
      _type: 'packageDetails',
      weight: {_type: 'shipmentWeight', value: p.weight.value, unit: p.weight.unit},
      dimensions: {
        _type: 'shippingOptionDimensions',
        length: p.dimensions.length,
        width: p.dimensions.width,
        height: p.dimensions.height,
        unit: p.dimensions.unit,
      },
    })),
    createdAt: new Date().toISOString(),
  }

  const created = await sanity.create(doc)

  // Notify team (optional)
  try {
    const to = process.env.FREIGHT_NOTIFY_TO || process.env.RESEND_TO || ''
    const from = process.env.RESEND_FROM || 'FAS Motorsports <noreply@updates.fasmotorsports.com>'
    const studioBase = process.env.SANITY_STUDIO_NETLIFY_BASE || ''
    if (resend && to) {
      const link = studioBase
        ? `${studioBase.replace(/\/$/, '')}/desk/intent/edit/id=${encodeURIComponent(created?._id || '')};type=freightQuote`
        : ''
      const contact = doc.contactName || ''
      const email = doc.contactEmail || ''
      const phone = doc.contactPhone || ''
      const addr = doc?.destination
        ? `${doc.destination.addressLine1 || ''} ${doc.destination.city || ''}, ${doc.destination.state || ''} ${doc.destination.postalCode || ''} ${doc.destination.country || ''}`
        : ''
      const subject = `Freight Quote Opened${contact ? ` — ${contact}` : ''}`
      const missing = getMissingResendFields({to, from, subject})
      if (missing.length) {
        throw new Error(`Missing email fields: ${missing.join(', ')}`)
      }
      const contextKey = `freight-quote:${created?._id || orderId || 'unknown'}:${to}`
      const reservation = await reserveEmailLog({contextKey, to, subject})
      reservationLogId = reservation.logId
      if (reservation.shouldSend) {
        const response = await resend.emails.send({
          from,
          to,
          subject,
          html: `
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
              <p>A freight quote task has been opened.</p>
              <ul>
                <li><strong>Contact:</strong> ${contact} ${email ? `&lt;${email}&gt;` : ''} ${phone ? `(${phone})` : ''}</li>
                <li><strong>Destination:</strong> ${addr}</li>
                <li><strong>Items:</strong> ${(doc.cart || []).map((c: any) => `${c.quantity || 1}× ${c.name || c.sku || 'Item'}`).join(', ')}</li>
              </ul>
              ${link ? `<p><a href="${link}" target="_blank">Open in Studio</a></p>` : ''}
            </div>
          `,
        })
        const resendId = (response as any)?.data?.id || (response as any)?.id || null
        await markEmailLogSent(reservation.logId, resendId)
      }
    }
  } catch (e) {
    await markEmailLogFailed(reservationLogId, e)
    console.warn('requestFreightQuote: notify skipped/failed', e)
  }

  return {
    statusCode: 200,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({freight: true, createdId: created?._id}),
  }
}
