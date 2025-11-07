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

function normalizeId(id?: string): string {
  if (!id) return ''
  return id.startsWith('drafts.') ? id.slice(7) : id
}

function resolveNetlifyBase(): string {
  const candidates = [
    process.env.NETLIFY_FUNCTIONS_BASE,
    process.env.NETLIFY_BASE_URL,
    process.env.SANITY_STUDIO_NETLIFY_BASE,
    process.env.AUTH0_BASE_URL,
  ]

  for (const candidate of candidates) {
    if (candidate && /^https?:\/\//i.test(candidate)) {
      return candidate.replace(/\/$/, '')
    }
  }

  return 'https://fassanity.fasmotorsports.com'
}

type InvoiceAddress = {
  name?: string
  phone?: string
  email?: string
  address_line1?: string
  addressLine1?: string
  address_line2?: string
  addressLine2?: string
  city_locality?: string
  city?: string
  state_province?: string
  state?: string
  postal_code?: string
  postalCode?: string
  country_code?: string
  country?: string
}

type Destination = {
  name?: string
  phone?: string
  email?: string
  addressLine1: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode: string
  country: string
}

function buildDestinationAddress(addr?: InvoiceAddress | null): Destination | null {
  if (!addr) return null
  const line1 = (addr.address_line1 || addr.addressLine1 || '').trim()
  const postal = (addr.postal_code || addr.postalCode || '').trim()
  const country = (addr.country_code || addr.country || '').trim().toUpperCase()
  if (!line1 || !postal || !country) return null
  return {
    name: (addr as any)?.name || undefined,
    phone: (addr as any)?.phone || undefined,
    email: (addr as any)?.email || undefined,
    addressLine1: line1,
    addressLine2: (addr.address_line2 || addr.addressLine2 || '').trim() || undefined,
    city: (addr.city_locality || addr.city || '').trim() || undefined,
    state: (addr.state_province || addr.state || '').trim() || undefined,
    postalCode: postal,
    country,
  }
}

type ShippingCartItem = {
  sku?: string
  productId?: string
  title?: string
  quantity: number
}

function buildShippingCart(lineItems: any[]): ShippingCartItem[] {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return []
  const cart: ShippingCartItem[] = []

  for (const item of lineItems) {
    if (!item) continue
    const quantity = Number(item?.quantity || 1)
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const productObj = item?.product || {}
    const productId = normalizeId(productObj?._id || productObj?._ref)
    const sku = (item?.sku || productObj?.sku || '').toString().trim()
    const title = (productObj?.title || item?.description || item?.name || '').toString().trim() || undefined

    if (!sku && !productId) continue

    cart.push({
      sku: sku || undefined,
      productId: productId || undefined,
      title,
      quantity,
    })
  }

  return cart
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
        lineItems[]{
          quantity,
          unitPrice,
          sku,
          description,
          product->{ _id, sku, title }
        },
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
        },
        shipTo {
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
    const hasManualTaxRate = Number.isFinite(invoice?.taxRate) && Number(invoice?.taxRate) > 0
    const automaticTaxEnabled = enableAutomaticTax && taxableBase > 0 && !hasManualTaxRate
    const amountForStripe = taxableBase > 0 ? taxableBase : total

    const shippingCart = buildShippingCart(invoice?.lineItems || [])
    const destination = buildDestinationAddress((invoice?.shipTo as InvoiceAddress) || (invoice?.billTo as InvoiceAddress))
    let shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined

    if (shippingCart.length && destination) {
      try {
        const netlifyBase = resolveNetlifyBase()
        const quoteRes = await fetch(`${netlifyBase}/.netlify/functions/getShippingQuoteBySkus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart: shippingCart, destination }),
        })
        const quoteData = await quoteRes.json().catch(() => ({}))

        if (quoteData?.installOnly) {
          console.log('createCheckout: shipping quote indicates install-only items; skipping shipping options.')
        } else if (quoteData?.freight) {
          console.log('createCheckout: shipping quote requires freight. Consider manual handling.', {
            invoiceId,
          })
        } else if (quoteRes.ok && !quoteData?.error && Array.isArray(quoteData?.rates) && quoteData.rates.length > 0) {
          const filteredRates = quoteData.rates
            .filter((rate: any) => Number.isFinite(Number(rate?.amount)))
            .filter((rate: any) => {
              const carrier = (rate?.carrier || '').toString().toLowerCase().trim()
              const service = (rate?.service || '').toString().toLowerCase().trim()
              const label = `${carrier} ${service}`.trim()
              return !label.includes('global post') && !label.includes('globalpost')
            })
            .sort((a: any, b: any) => Number(a?.amount || 0) - Number(b?.amount || 0))

          shippingOptions = filteredRates.slice(0, 6).map((rate: any) => {
            const amountCents = Math.max(0, Math.round(Number(rate.amount) * 100))
            const displayNameParts = [rate?.carrier, rate?.service].map((part: any) => (part || '').toString().trim()).filter(Boolean)
            const displayName = displayNameParts.join(' – ') || 'Shipping'
            const deliveryDays = Number(rate?.deliveryDays)
            const estimate = Number.isFinite(deliveryDays) && deliveryDays > 0
              ? {
                  minimum: { unit: 'business_day' as const, value: Math.max(1, Math.floor(deliveryDays)) },
                  maximum: { unit: 'business_day' as const, value: Math.max(1, Math.ceil(deliveryDays)) },
                }
              : undefined

            const metadata: Stripe.MetadataParam = {}
            const pushMeta = (key: string, value: unknown) => {
              if (value === undefined || value === null) return
              const raw = typeof value === 'number' ? String(value) : `${value}`
              const trimmed = raw.trim()
              if (trimmed) metadata[key] = trimmed
            }

            if (Number.isFinite(Number(rate?.amount))) {
              pushMeta('shipping_amount', Number(rate.amount).toFixed(2))
            }
            if (rate?.currency) {
              pushMeta('shipping_currency', String(rate.currency).toUpperCase())
            }
            pushMeta('shipping_carrier', rate?.carrier)
            pushMeta('shipping_carrier_id', rate?.carrierId || rate?.carrierCode)
            pushMeta('shipping_carrier_code', rate?.carrierCode)
            pushMeta('shipping_service', rate?.service)
            pushMeta('shipping_service_code', rate?.serviceCode)
            if (Number.isFinite(deliveryDays)) {
              pushMeta('shipping_delivery_days', Math.max(1, Math.round(deliveryDays)))
            }
            pushMeta('shipping_estimated_delivery_date', rate?.estimatedDeliveryDate)
            pushMeta('shipping_rate_id', rate?.rateId)
            pushMeta('shipping_rate_source', 'easypost')

            return {
              shipping_rate_data: {
                display_name: displayName,
                type: 'fixed_amount',
                fixed_amount: { amount: amountCents, currency: 'usd' },
                tax_behavior: 'exclusive',
                ...(estimate ? { delivery_estimate: estimate } : {}),
                ...(Object.keys(metadata).length ? { metadata } : {}),
              },
            }
          })
        } else {
          console.warn('createCheckout: shipping quote unavailable', {
            status: quoteRes.status,
            body: quoteData,
          })
        }
      } catch (err) {
        console.error('createCheckout: failed to fetch shipping quote', err)
      }
    }

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
    if (invoice?.invoiceNumber) metadata.order_number = String(invoice.invoiceNumber)
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
            ...(invoice?.invoiceNumber ? { order_number: String(invoice.invoiceNumber) } : {}),
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
      }

      if (allowedShippingCountries.length > 0) {
        sessionParams.shipping_address_collection = {
          allowed_countries: allowedShippingCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
        }
      }

      if (shippingOptions && shippingOptions.length > 0) {
        sessionParams.shipping_options = shippingOptions
      }

      if (hasManualTaxRate) {
        try {
          const jurisdiction = (billTo?.state_province || billTo?.country_code || 'US').toString().trim()
          const taxRatePct = Number(invoice?.taxRate)
          const existingRates = await stripe.taxRates.list({
            limit: 100,
            active: true,
            percentage: taxRatePct,
          })
          let taxRateId: string | undefined
          if (existingRates && existingRates.data.length > 0) {
            taxRateId = existingRates.data.find((rate: Stripe.TaxRate) => {
              if (!jurisdiction) return true
              const metaMatch = rate.metadata?.sanity_jurisdiction === jurisdiction
              const descMatch = (rate.jurisdiction || '').toLowerCase() === jurisdiction.toLowerCase()
              return metaMatch || descMatch
            })?.id
          }
          if (!taxRateId) {
            const created = await stripe.taxRates.create({
              display_name: 'Sales Tax',
              inclusive: false,
              percentage: taxRatePct,
              jurisdiction: jurisdiction || undefined,
              country: (billTo?.country_code || 'US').toUpperCase(),
              state: (billTo?.state_province || undefined) || undefined,
              metadata: {
                sanity_invoice_id: invoiceId,
                sanity_jurisdiction: jurisdiction || 'US',
              },
            })
            taxRateId = created.id
          }

          if (taxRateId) {
            const firstLineItem = sessionParams.line_items?.[0]
            if (firstLineItem?.price_data) {
              firstLineItem.price_data.tax_behavior = 'exclusive'
            }
            if (firstLineItem) {
              firstLineItem.tax_rates = [taxRateId]
            }
          }
        } catch (taxErr) {
          console.error('createCheckout: failed to configure manual tax rate', taxErr)
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
