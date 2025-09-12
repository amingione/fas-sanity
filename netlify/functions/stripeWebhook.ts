import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'

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

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

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

        // 1) If linked to an Invoice in Sanity, mark it paid
        const invoiceId = metadata['sanity_invoice_id']
        if (invoiceId) {
          const ids = idVariants(invoiceId)
          for (const id of ids) {
            try {
              await sanity.patch(id).set({ status: 'paid' }).commit({ autoGenerateArrayKeys: true })
              break
            } catch (e) {
              // try the other variant
            }
          }
        }

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

        // 3) Upsert an Order doc for visibility/fulfillment
        try {
          const existingId = await sanity.fetch(
            `*[_type == "order" && stripeSessionId == $sid][0]._id`,
            { sid: stripeSessionId }
          )

          const baseDoc: any = {
            _type: 'order',
            stripeSessionId,
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

          if (invoiceId) {
            baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }
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
              let titleName = sa?.name || email || 'Invoice'
              try {
                const cref = (baseDoc as any)?.customerRef?._ref
                if (cref) {
                  const cust = await sanity.fetch(`*[_type == "customer" && _id == $id][0]{firstName,lastName,email}`, { id: cref })
                  const full = [cust?.firstName, cust?.lastName].filter(Boolean).join(' ').trim()
                  if (full) titleName = full
                  else if (cust?.email) titleName = cust.email
                }
              } catch {}
              const siteOrderNo = (metadata['order_number'] || metadata['orderNo'] || metadata['website_order_number'] || '').toString().trim()
              const invBase: any = {
                _type: 'invoice',
                title: titleName,
                orderNumber: siteOrderNo || stripeSessionId || undefined,
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

        // Mark invoice paid if we can link
        if (invoiceId) {
          const ids = idVariants(invoiceId)
          for (const id of ids) {
            try {
              await sanity.patch(id).set({ status: 'paid' }).commit({ autoGenerateArrayKeys: true })
              break
            } catch {}
          }
        }

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

          const existingId = await sanity.fetch(
            `*[_type == "order" && stripeSessionId == $sid][0]._id`,
            { sid: pi.id }
          )
          const baseDoc: any = {
            _type: 'order',
            stripeSessionId: pi.id,
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
          if (invoiceId) baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }

          let orderId = existingId
          if (existingId) {
            await sanity.patch(existingId).set(baseDoc).commit({ autoGenerateArrayKeys: true })
          } else {
            const created = await sanity.create(baseDoc, { autoGenerateArrayKeys: true })
            orderId = created?._id
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
