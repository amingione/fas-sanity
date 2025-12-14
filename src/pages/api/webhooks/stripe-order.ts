import type {SanityClient} from '@sanity/client'
import {randomUUID} from 'crypto'
import type Stripe from 'stripe'
import type {OrderCartItem} from '@fas/sanity-config/types/order'
import {ORDER_NUMBER_PREFIX} from '../../../../netlify/lib/orderFormatting'
import {buildStripeSummary as buildStripeSummaryRecord} from '../../../../netlify/lib/stripeSummary'

type StripeCheckoutSession = Stripe.Checkout.Session

async function generateOrderNumber(client: SanityClient): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomValue = Math.floor(Math.random() * 1_000_000)
    const candidate = `${ORDER_NUMBER_PREFIX}-${randomValue.toString().padStart(6, '0')}`
    try {
      const existing = await client.fetch<number>(
        'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
        {num: candidate},
      )
      if (!Number(existing)) return candidate
    } catch (error) {
      console.warn('handleStripeCheckoutComplete: order number uniqueness check failed', error)
      return candidate
    }
  }
  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

const DEFAULT_CART_ITEM_NAME = 'Order Item'

const parseCurrency = (value?: string | null): number | undefined => {
  if (!value) return undefined
  const match = value.match(/-?\$?\s*([\d,]+(?:\.\d+)?)/)
  if (!match?.[1]) return undefined
  const parsed = Number.parseFloat(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseQuantity = (value?: string | null): number => {
  if (!value) return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function normalizeCartItem(raw: any, index: number): OrderCartItem | null {
  if (!raw || typeof raw !== 'object') return null
  const name =
    (typeof raw.name === 'string' && raw.name.trim()) ||
    (typeof raw.productName === 'string' && raw.productName.trim()) ||
    `${DEFAULT_CART_ITEM_NAME} ${index + 1}`
  const quantity = Number.isFinite(raw.quantity) && raw.quantity > 0 ? raw.quantity : 1
  const price =
    typeof raw.price === 'number'
      ? raw.price
      : typeof raw.amount === 'number'
        ? raw.amount
        : undefined
  return {
    _type: 'orderCartItem',
    _key: typeof raw._key === 'string' && raw._key ? raw._key : randomUUID(),
    name,
    sku: typeof raw.sku === 'string' && raw.sku ? raw.sku : undefined,
    price: typeof price === 'number' ? price : undefined,
    quantity,
  }
}

function parseCartFromMetadata(metadata?: Stripe.Metadata | null): OrderCartItem[] {
  if (!metadata) {
    return [
      {
        _type: 'orderCartItem',
        _key: randomUUID(),
        name: DEFAULT_CART_ITEM_NAME,
        quantity: 1,
      },
    ]
  }

  const jsonKeys = ['cart', 'cart_json', 'cartItems', 'cart_items']
  for (const key of jsonKeys) {
    const raw = metadata[key]
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((entry, index) => normalizeCartItem(entry, index))
            .filter((item): item is OrderCartItem => Boolean(item))
          if (normalized.length > 0) return normalized
        }
      } catch {
        // Ignore malformed cart payloads and fall back to single-line item below
      }
    }
  }

  const name =
    metadata.product_name ||
    metadata.item_name ||
    metadata.product ||
    metadata.title ||
    metadata.sku ||
    DEFAULT_CART_ITEM_NAME
  const price =
    parseCurrency(metadata.product_price) ||
    parseCurrency(metadata.item_price) ||
    parseCurrency(metadata.price) ||
    undefined
  const quantity =
    parseQuantity(metadata.product_quantity) ||
    parseQuantity(metadata.item_quantity) ||
    parseQuantity(metadata.quantity) ||
    1

  return [
    {
      _type: 'orderCartItem',
      _key: randomUUID(),
      name,
      sku: metadata.product_sku || metadata.sku || undefined,
      price,
      quantity,
    },
  ]
}

const buildStripeSummary = (session: StripeCheckoutSession) => buildStripeSummaryRecord({session})

export async function handleStripeCheckoutComplete(
  session: StripeCheckoutSession,
  client: SanityClient,
) {
  const orderNumber = await generateOrderNumber(client)

  // Build shipping address text
  const shippingAddressText = session.shipping_details
    ? [
        session.shipping_details.name,
        session.shipping_details.address?.line1,
        session.shipping_details.address?.line2,
        session.shipping_details.address?.city &&
          session.shipping_details.address?.state &&
          session.shipping_details.address?.postal_code
          ? `${session.shipping_details.address.city}, ${session.shipping_details.address.state} ${session.shipping_details.address.postal_code}`
          : null,
        session.shipping_details.address?.country,
        session.customer_details?.phone,
        session.customer_details?.email,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const orderDoc = {
    _type: 'order',
    orderNumber,
    status: 'paid',
    createdAt: new Date().toISOString(),

    // Customer
    customerName: session.customer_details?.name,
    customerEmail: session.customer_details?.email,

    // Amounts
    totalAmount: (session.amount_total ?? 0) / 100,
    amountSubtotal: (session.amount_subtotal ?? 0) / 100,
    amountTax: (session.total_details?.amount_tax ?? 0) / 100,
    amountShipping: (session.total_details?.amount_shipping ?? 0) / 100,
    amountDiscount: (session.total_details?.amount_discount ?? 0) / 100,
    currency: session.currency,

    // Payment
    paymentStatus: 'paid',
    paymentIntentId: session.payment_intent,
    stripeSessionId: session.id,
    paymentCaptured: true,
    paymentCapturedAt: new Date().toISOString(),

    // Fulfillment details (visible)
    fulfillmentDetails: {
      status: 'unfulfilled',
      shippingAddress: shippingAddressText,
      packageWeight: parseFloat(session.metadata?.shipping_total_weight_lbs || '2'),
      fulfillmentNotes: '',
    },

    // Hidden data storage
    shippingAddress: session.shipping_details
      ? {
          name: session.shipping_details.name || undefined,
          phone: session.customer_details?.phone || undefined,
          email: session.customer_details?.email || undefined,
          addressLine1: session.shipping_details.address?.line1 || undefined,
          addressLine2: session.shipping_details.address?.line2 || undefined,
          city: session.shipping_details.address?.city || undefined,
          state: session.shipping_details.address?.state || undefined,
          postalCode: session.shipping_details.address?.postal_code || undefined,
          country: session.shipping_details.address?.country || undefined,
        }
      : null,

    carrier: session.metadata?.shipping_carrier || 'USPS',
    service: session.metadata?.shipping_service_name || 'Standard',
    easypostRateId: session.metadata?.shipping_rate_id,
    estimatedDeliveryDate: session.metadata?.shipping_estimated_delivery_date,

    // Cart
    cart: parseCartFromMetadata(session.metadata),

    // Technical
    labelPurchased: false,
    confirmationEmailSent: false,
    webhookNotified: true,
    stripeSummary: buildStripeSummary(session),
  }

  const result = await client.create(orderDoc, {autoGenerateArrayKeys: true})
  console.log(`✅ Created order ${orderDoc.orderNumber}`)
  return result
}
