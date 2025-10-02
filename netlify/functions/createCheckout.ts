import { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'

// --- CORS (Studio at 8888/3333)
const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  const o = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// Use account default API version to avoid TS literal mismatches
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY as string) : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const CAN_PATCH = Boolean(process.env.SANITY_API_TOKEN)

function computeTotals(doc: any) {
  const items = Array.isArray(doc?.lineItems) ? doc.lineItems : []
  const discountType = (doc?.discountType === 'percent') ? 'percent' : 'amount'
  const discountValue = Number(doc?.discountValue || 0)
  const taxRate = Number(doc?.taxRate || 0)

  const subtotal = items.reduce((sum: number, li: any) => {
    const qty = Number(li?.quantity || 1)
    const unit = Number(li?.unitPrice || 0)
    const override = typeof li?.lineTotal === 'number' ? li.lineTotal : undefined
    const line = typeof override === 'number' ? override : qty * unit
    return sum + (isNaN(line) ? 0 : line)
  }, 0)

  const discountAmt = discountType === 'percent' ? subtotal * (discountValue / 100) : discountValue
  const taxableBase = Math.max(0, subtotal - discountAmt)
  const taxAmount = taxableBase * (taxRate / 100)
  const total = Math.max(0, taxableBase + taxAmount)

  return { subtotal, discountAmt, taxAmount, total }
}

// Helper to get both draft and published variants of a document ID
function idVariants(id: string): string[] {
  const ids = [id]
  if (id.startsWith('drafts.')) ids.push(id.replace('drafts.', ''))
  else ids.push(`drafts.${id}`)
  return Array.from(new Set(ids))
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Method Not Allowed' }) }
  if (!stripe) return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Stripe not configured' }) }

  console.log('createCheckout env', {
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    hasSanityToken: Boolean(process.env.SANITY_API_TOKEN),
  })

  let invoiceId = ''
  try {
    const payload = JSON.parse(event.body || '{}')
    invoiceId = String(payload.invoiceId || '').trim()
  } catch {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invalid JSON' }) }
  }

  if (!invoiceId) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Missing invoiceId' }) }

  try {
    // Fetch invoice doc
    const invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        invoiceNumber,
        title,
        lineItems,
        discountType,
        discountValue,
        taxRate,
        paymentLinkUrl,
        billTo {
          name,
          email,
          phone,
          address_line1,
          address_line2,
          city_locality,
          state_province,
          postal_code,
          country_code
        }
      }`,
      { id: invoiceId }
    )

    if (!invoice) {
      return { statusCode: 404, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invoice not found' }) }
    }

    const { subtotal, discountAmt, taxAmount, total } = computeTotals(invoice)
    const taxableBase = Math.max(0, subtotal - discountAmt)
    const autoTaxEnv = String(process.env.STRIPE_AUTOMATIC_TAX || 'true').toLowerCase()
    const enableAutomaticTax = autoTaxEnv !== 'false'
    const automaticTaxEnabled = enableAutomaticTax && taxableBase > 0
    const amountForStripe = automaticTaxEnabled ? taxableBase : total

    if (!amountForStripe || amountForStripe <= 0) {
      return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invoice total must be greater than 0' }) }
    }

    // If a link already exists, reuse it
    if (invoice.paymentLinkUrl) {
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: invoice.paymentLinkUrl, reused: true }) }
    }

    const baseUrl = process.env.AUTH0_BASE_URL || 'http://localhost:3333'

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('createCheckout: missing STRIPE_SECRET_KEY')
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Server is missing STRIPE_SECRET_KEY' }),
      }
    }
    
    const billTo = invoice?.billTo || {}
    const customerEmail = (billTo?.email || '').trim() || undefined
    const customerName = (billTo?.name || '').trim() || undefined

    const metadata: Stripe.MetadataParam = {
      sanity_invoice_id: invoiceId,
      sanity_invoice_number: String(invoice.invoiceNumber || ''),
    }
    if (customerName) metadata.bill_to_name = customerName
    if (customerEmail) metadata.bill_to_email = customerEmail
    const addressFields = {
      line1: billTo?.address_line1 || undefined,
      line2: billTo?.address_line2 || undefined,
      city: billTo?.city_locality || undefined,
      state: billTo?.state_province || undefined,
      postal_code: billTo?.postal_code || undefined,
      country: (billTo?.country_code || '').toUpperCase() || undefined,
    }
    const hasAddress = Object.values(addressFields).some(Boolean)
    if (hasAddress) metadata.bill_to_address = JSON.stringify(addressFields)

    const allowedShippingCountries = (process.env.STRIPE_TAX_ALLOWED_COUNTRIES || process.env.STRIPE_SHIPPING_COUNTRIES || process.env.STRIPE_ALLOWED_COUNTRIES || 'US')
      .split(',')
      .map(c => c.trim().toUpperCase())
      .filter(Boolean)

    // Diagnostics + amount in cents
    const unitAmount = Math.round(Number(amountForStripe) * 100)
    const currency = 'usd'
    const allowAffirm = currency === 'usd' && unitAmount >= 5000 && String(process.env.STRIPE_ENABLE_AFFIRM || 'true').toLowerCase() !== 'false'
    console.log('createCheckout diagnostics', {
      invoiceId,
      total,
      unitAmount,
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      baseUrl: process.env.AUTH0_BASE_URL || 'http://localhost:3333',
      subtotal,
      discountAmt,
      taxableBase,
      taxAmount,
      automaticTaxEnabled,
      allowAffirm,
    })

    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Invoice total must be a positive number' }),
      }
    }

    // Stripe minimum for USD is 50 cents
    if (unitAmount < 50) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Amount must be at least $0.50 to create a Stripe Checkout session' }),
      }
    }

    // Single line item for invoice total (simplest path). We can switch to itemized later.
    const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ['card']
    if (allowAffirm) paymentMethodTypes.push('affirm')

    let session
    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        payment_method_types: paymentMethodTypes,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: `Invoice ${invoice.invoiceNumber || ''}`.trim() || 'Invoice Payment' },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        customer_email: customerEmail,
        metadata,
        payment_intent_data: {
          metadata: {
            sanity_invoice_id: invoiceId,
            sanity_invoice_number: String(invoice.invoiceNumber || ''),
          },
        },
        success_url: `${baseUrl}/invoice/success?invoiceId=${encodeURIComponent(invoiceId)}`,
        cancel_url: `${baseUrl}/invoice/cancel?invoiceId=${encodeURIComponent(invoiceId)}`,
      }

      if (allowAffirm) {
        sessionParams.phone_number_collection = { enabled: true }
      }

      if (automaticTaxEnabled) {
        sessionParams.automatic_tax = { enabled: true }
        if (allowedShippingCountries.length > 0) {
          sessionParams.shipping_address_collection = {
            allowed_countries: allowedShippingCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          }
        }
      }

      session = await stripe.checkout.sessions.create(sessionParams)
    } catch (e: any) {
      console.error('Stripe create session failed', { message: e?.message, type: e?.type, code: e?.code })
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Stripe session creation failed',
          error: e?.message,
          type: e?.type,
          code: e?.code,
          raw: e?.raw,
        }),
      }
    }

    const url = session?.url || ''
    if (!url) {
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Failed to create checkout session: no URL from Stripe' }),
      }
    }

    // Try to persist the URL on the invoice (draft and published variants), but never fail the request if we can't write.
    if (CAN_PATCH) {
      try {
        const ids = idVariants(invoiceId)
        for (const id of ids) {
          try {
            await sanity.patch(id).set({ paymentLinkUrl: url }).commit({ autoGenerateArrayKeys: true })
            break // saved on one variant; stop trying others
          } catch {
            // try the other variant (draft/published)
          }
        }
      } catch {
        console.warn('createCheckout: patch paymentLinkUrl failed (permissions or token issue). Continuing.')
      }
    } else {
      console.warn('createCheckout: SANITY_API_TOKEN not set — skipping persist of paymentLinkUrl.')
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }
  } catch (err: any) {
    console.error('createCheckout error', err)
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Failed to create checkout session', error: String(err?.message || err) }) }
  }
}
