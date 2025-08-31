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
          cart = (items?.data || []).map((li) => {
            const qty = Number(li.quantity || 0)
            const unitAmount = Number((li.price as any)?.unit_amount || 0) / 100
            const productObj: any = (li.price as any)?.product
            return {
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
            ...(shippingAddress ? { shippingAddress } : {}),
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
            const created = await sanity.create({ ...baseDoc, webhookNotified: true })
            orderId = created?._id
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
          const email = (pi?.charges as any)?.data?.[0]?.billing_details?.email || (pi as any)?.receipt_email || undefined

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
          }
          if (invoiceId) baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }

          let orderId = existingId
          if (existingId) {
            await sanity.patch(existingId).set(baseDoc).commit({ autoGenerateArrayKeys: true })
          } else {
            const created = await sanity.create(baseDoc)
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

export { handler }
