import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'
import { randomUUID } from 'crypto'

// Netlify delivers body as string; may be base64-encoded
function getRawBody(event: any): Buffer {
  const body = event.body || ''
  if (event.isBase64Encoded) return Buffer.from(body, 'base64')
  return Buffer.from(body)
}

function idVariants(id?: string): string[] {
  if (!id) return []
  const ids = [id]
  if (id.startsWith('drafts.')) ids.push(id.replace('drafts.', ''))
  else ids.push(`drafts.${id}`)
  return Array.from(new Set(ids))
}

function createOrderSlug(source?: string | null, fallback?: string | null): string | null {
  const raw = (source || fallback || '').toString().trim()
  if (!raw) return null
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return slug || null
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

function candidateFromSessionId(id?: string | null): string | undefined {
  if (!id) return undefined
  const core = id.toString().trim().replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function generateRandomOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    try {
      const existing = await sanity.fetch<number>(
        'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
        { num: candidate }
      )
      if (!Number(existing)) return candidate
    } catch (err) {
      console.warn('stripeWebhook: order number uniqueness check failed', err)
      return candidate
    }
  }
  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

async function resolveOrderNumber(options: {
  metadataOrderNumber?: string
  invoiceNumber?: string
  fallbackId?: string
}): Promise<string> {
  const candidates = [
    sanitizeOrderNumber(options.metadataOrderNumber),
    sanitizeOrderNumber(options.invoiceNumber),
    candidateFromSessionId(options.fallbackId),
  ].filter(Boolean) as string[]
  if (candidates.length > 0) return candidates[0]
  return generateRandomOrderNumber()
}

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const money = (value?: number) => (typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '')

const renderAddressHtml = (address?: any): string => {
  if (!address) return ''
  const lines = [
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter((line) => Boolean(line && String(line).trim()))
  if (lines.length === 0) return ''
  return lines.map((line) => `<div>${line}</div>`).join('')
}

const renderAddressText = (address?: any): string => {
  if (!address) return ''
  const lines = [
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter((line) => Boolean(line && String(line).trim()))
  return lines.join('\n')
}

async function sendOrderConfirmationEmail(opts: {
  to: string
  orderNumber: string
  customerName?: string
  items: Array<{ name?: string; sku?: string; quantity?: number; price?: number }>
  totalAmount?: number
  subtotal?: number
  taxAmount?: number
  shippingAmount?: number
  shippingAddress?: any
}) {
  if (!RESEND_API_KEY || !opts.to) return

  const { to, orderNumber, customerName, items, totalAmount, subtotal, taxAmount, shippingAmount, shippingAddress } = opts

  const displayOrderNumber = sanitizeOrderNumber(orderNumber) || orderNumber
  const trimmedName = (customerName || '').toString().trim()
  const greetingLine = trimmedName
    ? `Hi ${trimmedName}, we’re getting your order ready now.`
    : 'We’re getting your order ready now.'
  const salutationPlain = trimmedName ? `Hi ${trimmedName}` : 'Hi there'

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
            .map((item) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                  <div style="font-size:14px;color:#111827;font-weight:600;">${item?.name || item?.sku || 'Item'}</div>
                  ${item?.sku ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">SKU ${item.sku}</div>` : ''}
                </td>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#374151;">${Number(item?.quantity || 1)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#374151;">${money(item?.price)}</td>
              </tr>
            `)
            .join('')}
        </tbody>
      </table>`
    : ''

  const shippingHtml = renderAddressHtml(shippingAddress)
    ? `<div style="margin:24px 0 12px;">
        <h3 style="margin:0 0 6px;font-size:15px;color:#111827;">Shipping to</h3>
        <div style="font-size:14px;color:#374151;line-height:1.5;">${renderAddressHtml(shippingAddress)}</div>
      </div>`
    : ''

  const summaryRows = [
    { label: 'Subtotal', value: money(typeof subtotal === 'number' ? subtotal : undefined) },
    { label: 'Shipping', value: money(typeof shippingAmount === 'number' ? shippingAmount : undefined) },
    { label: 'Tax', value: money(typeof taxAmount === 'number' ? taxAmount : undefined) },
  ].filter((row) => row.value)

  const totalDisplay = money(totalAmount)
  const summaryHtml = (summaryRows.length || totalDisplay)
    ? `<div style="margin:12px 0 24px;padding:12px 16px;border:1px solid #e4e4e7;border-radius:12px;background:#f9fafb;max-width:340px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tbody>
            ${summaryRows
              .map((row) => `
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#52525b;">${row.label}</td>
                  <td style="padding:6px 0;font-size:13px;color:#374151;text-align:right;">${row.value}</td>
                </tr>
              `)
              .join('')}
            ${totalDisplay
              ? `<tr>
                  <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;border-top:1px solid #e4e4e7;">Total</td>
                  <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;text-align:right;border-top:1px solid #e4e4e7;">${totalDisplay}</td>
                </tr>`
              : ''}
          </tbody>
        </table>
      </div>`
    : ''

  const html = `
    <div style="margin:0;padding:24px 12px;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;color:#ffffff;padding:24px 28px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;">Thank you for your order${displayOrderNumber ? ` <span style=\"color:#f97316\">#${displayOrderNumber}</span>` : ''}</h1>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">${greetingLine}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 24px;color:#111827;">
            <p style="margin:0 0 16px;font-size:15px;">Here’s a quick summary for your records. We’ll send tracking details as soon as your package ships.</p>
            ${itemsHtml}
            ${summaryHtml}
            ${shippingHtml}
            <div style="margin:28px 0 0;padding:16px 20px;border-radius:10px;background:#f9fafb;color:#4b5563;font-size:13px;border:1px solid #e4e4e7;">
              Questions? Reply to this email or call us at (812) 200-9012.
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
    .map((item) => `- ${Number(item?.quantity || 1)} × ${item?.name || item?.sku || 'Item'} ${money(item?.price)}`)
    .join('\n') || '- (details unavailable)'

  const textLines: string[] = []
  textLines.push(`${salutationPlain},`)
  textLines.push('')
  textLines.push(`Thank you for your order${displayOrderNumber ? ` #${displayOrderNumber}` : ''}!`)
  textLines.push('')
  textLines.push('Items:')
  textLines.push(textItems)
  if (totalDisplay) {
    textLines.push('')
    textLines.push(`Order total: ${totalDisplay}`)
  }
  if (renderAddressText(shippingAddress)) {
    textLines.push('')
    textLines.push('Shipping to:')
    textLines.push(renderAddressText(shippingAddress))
  }
  textLines.push('')
  textLines.push('We will email you tracking details as soon as your package ships.')
  textLines.push('')
  textLines.push('Questions? Reply to this email or call (812) 200-9012.')
  textLines.push('')
  textLines.push('— F.A.S. Motorsports')

  const text = textLines.join('\n')

  const subject = displayOrderNumber
    ? `Order Confirmation #${displayOrderNumber} – F.A.S. Motorsports`
    : 'Order Confirmation – F.A.S. Motorsports'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'orders@fasmotorsports.com',
      to,
      subject,
      html,
      text,
    }),
  })
}

export const handler: Handler = async (event) => {
  if (!stripe) return { statusCode: 500, body: 'Stripe not configured' }

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!endpointSecret) return { statusCode: 500, body: 'Missing STRIPE_WEBHOOK_SECRET' }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const sig = (event.headers['stripe-signature'] || event.headers['Stripe-Signature']) as string
  if (!sig) return { statusCode: 400, body: 'Missing Stripe-Signature header' }

  let webhookEvent: Stripe.Event
  try {
    const raw = getRawBody(event)
    webhookEvent = stripe.webhooks.constructEvent(raw, sig, endpointSecret)
  } catch (err: any) {
    console.error('stripeWebhook signature verification failed:', err?.message || err)
    return { statusCode: 400, body: `Webhook Error: ${err?.message || 'invalid signature'}` }
  }

  try {
    switch (webhookEvent.type) {
      case 'checkout.session.completed': {
        const session = webhookEvent.data.object as Stripe.Checkout.Session
        const email = session.customer_details?.email || session.customer_email || ''
        const totalAmount = (Number(session.amount_total || 0) || 0) / 100
        const stripeSessionId = session.id
        const mode = session.mode
        const metadata = (session.metadata || {}) as Record<string, string>
        const userIdMeta = (
          metadata['auth0_user_id'] ||
          metadata['auth0_sub'] ||
          metadata['userId'] ||
          metadata['user_id'] ||
          ''
        ).toString().trim() || undefined

        // Enrich with Stripe payment details if available
        let paymentIntent: Stripe.PaymentIntent | null = null
        try {
          if (session.payment_intent) {
            paymentIntent = await stripe.paymentIntents.retrieve(String(session.payment_intent))
          }
        } catch {}

        const currency = ((session as any)?.currency || (paymentIntent as any)?.currency || '').toString().toLowerCase() || undefined
        const amountSubtotal = Number.isFinite(Number((session as any)?.amount_subtotal)) ? Number((session as any)?.amount_subtotal) / 100 : undefined
        const amountTax = Number.isFinite(Number((session as any)?.total_details?.amount_tax)) ? Number((session as any)?.total_details?.amount_tax) / 100 : undefined
        const amountShipping = (() => {
          const a = Number((session as any)?.shipping_cost?.amount_total)
          if (Number.isFinite(a)) return a / 100
          const b = Number((session as any)?.total_details?.amount_shipping)
          return Number.isFinite(b) ? b / 100 : undefined
        })()
        let chargeId: string | undefined
        let cardBrand: string | undefined
        let cardLast4: string | undefined
        let receiptUrl: string | undefined
        try {
          const ch = (paymentIntent as any)?.charges?.data?.[0]
          if (ch) {
            chargeId = ch.id || undefined
            receiptUrl = ch.receipt_url || undefined
            const c = ch.payment_method_details?.card
            cardBrand = c?.brand || undefined
            cardLast4 = c?.last4 || undefined
          }
        } catch {}

        const metadataOrderNumberRaw = (metadata['order_number'] || metadata['orderNo'] || metadata['website_order_number'] || '')
          .toString()
          .trim()
        const metadataInvoiceNumber = (metadata['sanity_invoice_number'] || metadata['invoice_number'] || '')
          .toString()
          .trim()
        const orderNumber = await resolveOrderNumber({
          metadataOrderNumber: metadataOrderNumberRaw,
          invoiceNumber: metadataInvoiceNumber,
          fallbackId: stripeSessionId,
        })

        const invoiceId = metadata['sanity_invoice_id']
        const metadataCustomerName = (metadata['bill_to_name'] || metadata['customer_name'] || '').toString().trim()

        // 2) Gather enriched data: line items + shipping
        let cart: Array<{ id?: string; name?: string; price?: number; quantity?: number; categories?: string[] }> = []
        try {
          const items = await stripe.checkout.sessions.listLineItems(stripeSessionId, {
            limit: 100,
            expand: ['data.price.product'],
          })
          cart = (items?.data || []).map((li: any) => {
            const qty = Number(li.quantity || 0)
            const unitAmount = Number((li.price as any)?.unit_amount || 0) / 100
            const productObj: any = (li.price as any)?.product
            return {
              _type: 'orderCartItem',
              _key: randomUUID(),
              id: (li.price?.id || productObj?.id || '').toString() || undefined,
              name: (productObj?.name || li.description || '').toString() || undefined,
              sku: (productObj?.metadata?.sku || (li as any)?.metadata?.sku || '').toString() || undefined,
              price: Number.isFinite(unitAmount) ? unitAmount : undefined,
              quantity: Number.isFinite(qty) ? qty : undefined,
              categories: Array.isArray(productObj?.metadata?.categories)
                ? productObj.metadata.categories
                : (productObj?.metadata?.category ? [productObj.metadata.category] : undefined),
            }
          })
        } catch (e) {
          console.warn('stripeWebhook: listLineItems failed, continuing without cart', e)
        }

        let shippingAddress: any = undefined
        try {
          const cd = session.customer_details
          const addr = (cd?.address || (session as any).shipping_details?.address) as Stripe.Address | undefined
          const name = cd?.name || (session as any).shipping_details?.name || undefined
          const phone = cd?.phone || (session as any).shipping_details?.phone || undefined
          shippingAddress = addr
            ? {
                name: name || undefined,
                phone: phone || undefined,
                email: email || undefined,
                addressLine1: (addr as any).line1 || undefined,
                addressLine2: (addr as any).line2 || undefined,
                city: (addr as any).city || undefined,
                state: (addr as any).state || undefined,
                postalCode: (addr as any).postal_code || undefined,
                country: (addr as any).country || undefined,
              }
            : undefined
        } catch (e) {
          console.warn('stripeWebhook: could not parse shipping address')
        }

        const customerName = (shippingAddress?.name || metadataCustomerName || session.customer_details?.name || email || '').toString().trim() || undefined

        // 3) Upsert an Order doc for visibility/fulfillment
        try {
          const existingId = await sanity.fetch(
            `*[_type == "order" && stripeSessionId == $sid][0]._id`,
            { sid: stripeSessionId }
          )
          const normalizedEmail = typeof email === 'string' ? email.trim() : ''
          const shouldSendConfirmation = !existingId && Boolean(normalizedEmail) && Boolean(RESEND_API_KEY)

          const baseDoc: any = {
            _type: 'order',
            stripeSessionId,
            orderNumber,
            customerName,
            customerEmail: email || undefined,
            totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
            status: 'paid',
            createdAt: new Date().toISOString(),
            paymentStatus: (session.payment_status || (paymentIntent?.status === 'succeeded' ? 'paid' : 'unpaid')) as string,
            currency,
            amountSubtotal,
            amountTax,
            amountShipping,
            paymentIntentId: paymentIntent?.id || undefined,
            chargeId,
            cardBrand,
            cardLast4,
            receiptUrl,
            ...(shippingAddress ? { shippingAddress } : {}),
            ...(userIdMeta ? { userId: userIdMeta } : {}),
            ...(cart.length ? { cart } : {}),
          }

          const orderSlug = createOrderSlug(orderNumber, stripeSessionId)
          if (orderSlug) baseDoc.slug = { _type: 'slug', current: orderSlug }

          if (invoiceId) {
            baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }
          }

          if (invoiceId) {
            const invoiceNumberToSet = sanitizeOrderNumber(metadataInvoiceNumber) || orderNumber
            const ids = idVariants(invoiceId)
            for (const id of ids) {
              try {
                let patch = sanity.patch(id).set({ status: 'paid' })
                if (orderNumber) patch = patch.setIfMissing({ orderNumber })
                if (invoiceNumberToSet) patch = patch.setIfMissing({ invoiceNumber: invoiceNumberToSet })
                if (customerName) patch = patch.setIfMissing({ title: customerName })
                await patch.commit({ autoGenerateArrayKeys: true })
                break
              } catch (e) {
                // try next variant
              }
            }
          }

          // Try to link to an existing customer by email
          if (email) {
            try {
              const customerId = await sanity.fetch(
                `*[_type == "customer" && email == $email][0]._id`,
                { email }
              )
              if (customerId) baseDoc.customerRef = { _type: 'reference', _ref: customerId }
            } catch {}
          }

          let orderId = existingId
          if (existingId) {
            await sanity.patch(existingId).set(baseDoc).setIfMissing({ webhookNotified: true }).commit({ autoGenerateArrayKeys: true })
          } else {
            const created = await sanity.create({ ...baseDoc, webhookNotified: true }, { autoGenerateArrayKeys: true })
            orderId = created?._id
          }

          if (shouldSendConfirmation && orderId) {
            try {
              await sendOrderConfirmationEmail({
                to: normalizedEmail,
                orderNumber,
                customerName,
                items: cart,
                totalAmount,
                subtotal: typeof amountSubtotal === 'number' ? amountSubtotal : undefined,
                taxAmount: typeof amountTax === 'number' ? amountTax : undefined,
                shippingAmount: typeof amountShipping === 'number' ? amountShipping : undefined,
                shippingAddress,
              })
              await sanity.patch(orderId).set({ confirmationEmailSent: true }).commit({ autoGenerateArrayKeys: true })
            } catch (err) {
              console.warn('stripeWebhook: order confirmation email failed', err)
            }
          }

          // If no invoice was linked, create one from the order so Studio has a full record
          try {
            if (!invoiceId && orderId) {
              const skus = (cart || []).map((c: any) => (c?.sku || '').toString().trim()).filter(Boolean)
              const titles = (cart || []).map((c: any) => (c?.name || '').toString().trim()).filter(Boolean)
              let products: any[] = []
              if (skus.length || titles.length) {
                try { products = await sanity.fetch(`*[_type == "product" && (sku in $skus || title in $titles)]{_id, title, sku}`, { skus, titles }) } catch {}
              }
              const findRef = (ci: any): string | null => {
                if (!products?.length) return null
                if (ci?.sku) { const p = products.find((p) => p?.sku === ci.sku); if (p) return p._id }
                if (ci?.name) { const p = products.find((p) => p?.title === ci.name); if (p) return p._id }
                return null
              }
              const invoiceLineItems = (cart || []).map((ci: any) => {
                const qty = Number(ci?.quantity || 1)
                const unit = Number(ci?.price || 0)
                const line = Number.isFinite(qty * unit) ? qty * unit : undefined
                const ref = findRef(ci)
                return {
                  _type: 'invoiceLineItem' as const,
                  _key: randomUUID(),
                  description: (ci?.name || ci?.sku || 'Item').toString(),
                  sku: (ci?.sku || '').toString() || undefined,
                  quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
                  unitPrice: Number.isFinite(unit) ? unit : undefined,
                  lineTotal: Number.isFinite(line as number) ? (line as number) : undefined,
                  ...(ref ? { product: { _type: 'reference', _ref: ref } } : {}),
                }
              })
              const taxRatePct = Number.isFinite(amountSubtotal || NaN) && Number.isFinite(amountTax || NaN) && (amountSubtotal as number) > 0
                ? Math.round(((amountTax as number) / (amountSubtotal as number)) * 10000) / 100
                : undefined
              const sa: any = shippingAddress || {}
              const billTo = sa && (sa.name || sa.addressLine1)
                ? {
                    _type: 'billTo',
                    name: sa.name || undefined,
                    email: sa.email || email || undefined,
                    phone: sa.phone || undefined,
                    address_line1: sa.addressLine1 || undefined,
                    address_line2: sa.addressLine2 || undefined,
                    city_locality: sa.city || undefined,
                    state_province: sa.state || undefined,
                    postal_code: sa.postalCode || undefined,
                    country_code: sa.country || undefined,
                  }
                : undefined
              const shipTo = billTo ? { ...billTo, _type: 'shipTo' } : undefined
              const createdAtIso = (() => {
                try {
                  const t = (session as any)?.created || (paymentIntent as any)?.created
                  if (typeof t === 'number' && t > 0) return new Date(t * 1000).toISOString()
                } catch {}
                return new Date().toISOString()
              })()
              // Prefer full name from linked customer if available
              let titleName = customerName || sa?.name || email || 'Invoice'
              try {
                const cref = (baseDoc as any)?.customerRef?._ref
                if (cref) {
                  const cust = await sanity.fetch(`*[_type == "customer" && _id == $id][0]{firstName,lastName,email}`, { id: cref })
                  const full = [cust?.firstName, cust?.lastName].filter(Boolean).join(' ').trim()
                  if (full) titleName = full
                  else if (cust?.email) titleName = cust.email
                }
              } catch {}
              const invBase: any = {
                _type: 'invoice',
                title: titleName,
                orderNumber,
                invoiceNumber: sanitizeOrderNumber(metadataInvoiceNumber) || orderNumber,
                customerRef: baseDoc.customerRef || undefined,
                orderRef: { _type: 'reference', _ref: orderId },
                billTo,
                shipTo,
                lineItems: invoiceLineItems,
                discountType: 'amount',
                discountValue: 0,
                taxRate: taxRatePct || 0,
                subtotal: Number.isFinite(amountSubtotal || NaN) ? (amountSubtotal as number) : undefined,
                total: Number.isFinite(totalAmount || NaN) ? totalAmount : undefined,
                amountSubtotal: Number.isFinite(amountSubtotal || NaN) ? (amountSubtotal as number) : undefined,
                amountTax: Number.isFinite(amountTax || NaN) ? (amountTax as number) : undefined,
                currency: currency || 'usd',
                customerEmail: email || undefined,
                userId: userIdMeta || undefined,
                status: 'paid',
                invoiceDate: createdAtIso.slice(0,10),
                dueDate: createdAtIso.slice(0,10),
              }
              const createdInv = await sanity.create(invBase, { autoGenerateArrayKeys: true })
              if (createdInv?._id) {
                try { await sanity.patch(orderId).set({ invoiceRef: { _type: 'reference', _ref: createdInv._id } }).commit({ autoGenerateArrayKeys: true }) } catch {}
              }
            }
          } catch (e) {
            console.warn('stripeWebhook: failed to create invoice from order', e)
          }

          // 4) Auto-fulfillment: call our Netlify function to generate packing slip, label, and email
          try {
            if (orderId) {
              const base = (
                process.env.SANITY_STUDIO_NETLIFY_BASE ||
                process.env.PUBLIC_SITE_URL ||
                process.env.AUTH0_BASE_URL ||
                ''
              ).trim()
              if (base && base.startsWith('http')) {
                const url = `${base.replace(/\/$/, '')}/.netlify/functions/fulfill-order`
                await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderId }),
                })
              }
            }
          } catch (e) {
            console.warn('stripeWebhook: auto-fulfillment call failed', e)
          }
        } catch (e) {
          console.error('stripeWebhook: failed to upsert Order doc:', e)
          // Do not fail the webhook; Stripe will retry and we may create duplicates otherwise
        }

        break
      }

      case 'payment_intent.succeeded': {
        const pi = webhookEvent.data.object as Stripe.PaymentIntent
        const meta = (pi.metadata || {}) as Record<string, string>
        const userIdMeta = (
          meta['auth0_user_id'] ||
          meta['auth0_sub'] ||
          meta['userId'] ||
          meta['user_id'] ||
          ''
        ).toString().trim() || undefined
        const invoiceId = meta['sanity_invoice_id']

        // Create a minimal Order if none exists yet
        try {
          const totalAmount = (Number(pi.amount_received || pi.amount || 0) || 0) / 100
          const email = (pi as any)?.charges?.data?.[0]?.billing_details?.email || (pi as any)?.receipt_email || undefined
          const currency = ((pi as any)?.currency || '').toString().toLowerCase() || undefined
          const ch = (pi as any)?.charges?.data?.[0]
          const chargeId = ch?.id || undefined
          const receiptUrl = ch?.receipt_url || undefined
          const cardBrand = ch?.payment_method_details?.card?.brand || undefined
          const cardLast4 = ch?.payment_method_details?.card?.last4 || undefined
          const shippingAddr: any = (pi as any)?.shipping?.address || undefined

          const metadataOrderNumberRaw = (meta['order_number'] || meta['orderNo'] || meta['website_order_number'] || '')
            .toString()
            .trim()
          const metadataInvoiceNumber = (meta['sanity_invoice_number'] || meta['invoice_number'] || '')
            .toString()
            .trim()
          const orderNumber = await resolveOrderNumber({
            metadataOrderNumber: metadataOrderNumberRaw,
            invoiceNumber: metadataInvoiceNumber,
            fallbackId: pi.id,
          })
          const customerName = ((pi as any)?.shipping?.name || meta['bill_to_name'] || email || '').toString().trim() || undefined

          const existingId = await sanity.fetch(
            `*[_type == "order" && stripeSessionId == $sid][0]._id`,
            { sid: pi.id }
          )
          const normalizedEmail = typeof email === 'string' ? email.trim() : ''
          const shouldSendConfirmation = !existingId && Boolean(normalizedEmail) && Boolean(RESEND_API_KEY)
          const baseDoc: any = {
            _type: 'order',
            stripeSessionId: pi.id,
            orderNumber,
            customerName,
            customerEmail: email || undefined,
            totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
            status: 'paid',
            createdAt: new Date().toISOString(),
            paymentStatus: (pi.status || 'succeeded') as string,
            currency,
            paymentIntentId: pi.id,
            chargeId,
            cardBrand,
            cardLast4,
            receiptUrl,
            ...(userIdMeta ? { userId: userIdMeta } : {}),
            ...(shippingAddr ? {
              shippingAddress: {
                name: (pi as any)?.shipping?.name || undefined,
                addressLine1: shippingAddr.line1 || undefined,
                addressLine2: shippingAddr.line2 || undefined,
                city: shippingAddr.city || undefined,
                state: shippingAddr.state || undefined,
                postalCode: shippingAddr.postal_code || undefined,
                country: shippingAddr.country || undefined,
                email: email || undefined,
              }
            } : {}),
          }
          const intentSlug = createOrderSlug(orderNumber, pi.id)
          if (intentSlug) baseDoc.slug = { _type: 'slug', current: intentSlug }
          if (invoiceId) baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }

          if (invoiceId) {
            const invoiceNumberToSet = sanitizeOrderNumber(metadataInvoiceNumber) || orderNumber
            const ids = idVariants(invoiceId)
            for (const id of ids) {
              try {
                let patch = sanity.patch(id).set({ status: 'paid' })
                if (orderNumber) patch = patch.setIfMissing({ orderNumber })
                if (invoiceNumberToSet) patch = patch.setIfMissing({ invoiceNumber: invoiceNumberToSet })
                if (customerName) patch = patch.setIfMissing({ title: customerName })
                await patch.commit({ autoGenerateArrayKeys: true })
                break
              } catch {}
            }
          }

          let orderId = existingId
          if (existingId) {
            await sanity.patch(existingId).set(baseDoc).commit({ autoGenerateArrayKeys: true })
          } else {
            const created = await sanity.create(baseDoc, { autoGenerateArrayKeys: true })
            orderId = created?._id
          }

          if (shouldSendConfirmation && orderId) {
            try {
              await sendOrderConfirmationEmail({
                to: normalizedEmail,
                orderNumber,
                customerName,
                items: [],
                totalAmount,
                shippingAddress: shippingAddr,
              })
              await sanity.patch(orderId).set({ confirmationEmailSent: true }).commit({ autoGenerateArrayKeys: true })
            } catch (err) {
              console.warn('stripeWebhook: PI order confirmation email failed', err)
            }
          }

          // Try auto-fulfillment only if we have a shipping address on the PI
          try {
            const base = (
              process.env.SANITY_STUDIO_NETLIFY_BASE ||
              process.env.PUBLIC_SITE_URL ||
              process.env.AUTH0_BASE_URL ||
              ''
            ).trim()
            const hasShipping = Boolean((pi as any)?.shipping?.address?.line1)
            if (base && base.startsWith('http') && orderId && hasShipping) {
              const url = `${base.replace(/\/$/, '')}/.netlify/functions/fulfill-order`
              await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId }),
              })
            }
          } catch {}
        } catch (e) {
          console.warn('stripeWebhook: PI fallback order creation failed', e)
        }
        break
      }
      case 'checkout.session.expired':
        // Optional: mark related pending orders/invoices as cancelled
        break
      default:
        // Ignore other events quietly
        break
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) }
  } catch (err: any) {
    console.error('stripeWebhook handler error:', err)
    // Return 200 to avoid aggressive retries if our internal handling fails non-critically
    return { statusCode: 200, body: JSON.stringify({ received: true, hint: 'internal error logged' }) }
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
