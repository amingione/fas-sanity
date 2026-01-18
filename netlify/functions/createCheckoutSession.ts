import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {randomUUID} from 'crypto'

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

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION}) : null

const sanityProjectId = process.env.SANITY_STUDIO_PROJECT_ID
const sanityDataset = process.env.SANITY_STUDIO_DATASET
const sanity =
  sanityProjectId && sanityDataset
    ? createClient({
        projectId: sanityProjectId,
        dataset: sanityDataset,
        apiVersion: process.env.SANITY_STUDIO_API_VERSION || '2024-04-10',
        token: process.env.SANITY_API_TOKEN,
        useCdn: false,
      })
    : null

const normalizeSanityId = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

type ProductShippingSnapshot = {
  _id: string
  title?: string
  shippingWeight?: number | null
  installOnly?: boolean | null
  shippingConfig?: {
    requiresShipping?: boolean | null
    weight?: number | null
    dimensions?: {length?: number | null; width?: number | null; height?: number | null} | null
    shippingClass?: string | null
    installOnly?: boolean | null
  } | null
}

const toPositiveNumber = (value?: unknown): number | null => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

const resolveProductWeight = (product?: ProductShippingSnapshot | null): number | null => {
  if (!product) return null
  const configWeight = toPositiveNumber(product.shippingConfig?.weight)
  if (configWeight !== null) return configWeight
  return toPositiveNumber(product.shippingWeight)
}

const resolveRequiresShipping = (product?: ProductShippingSnapshot | null): boolean => {
  if (!product) return true
  const requiresShipping = product.shippingConfig?.requiresShipping
  if (typeof requiresShipping === 'boolean') return requiresShipping
  return true
}

const resolveProductDimensions = (
  product?: ProductShippingSnapshot | null,
): {length: number; width: number; height: number} | null => {
  if (!product) return null
  const dims = product.shippingConfig?.dimensions
  if (!dims) return null
  const length = toPositiveNumber(dims.length)
  const width = toPositiveNumber(dims.width)
  const height = toPositiveNumber(dims.height)
  if (length === null || width === null || height === null) return null
  return {length, width, height}
}

const resolveCartQuantity = (value?: unknown): number => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 1
  return Math.max(1, Math.round(num))
}

const resolveShippingClass = (product?: ProductShippingSnapshot | null): string | null => {
  if (!product) return null
  const configClass = product.shippingConfig?.shippingClass
  if (typeof configClass === 'string' && configClass.trim()) return configClass.trim()
  return null
}

const resolveInstallOnly = (product?: ProductShippingSnapshot | null): boolean => {
  if (!product) return false
  const configInstallOnly = product.shippingConfig?.installOnly
  if (typeof configInstallOnly === 'boolean') return configInstallOnly
  const topLevelInstallOnly = product.installOnly
  if (typeof topLevelInstallOnly === 'boolean') return topLevelInstallOnly
  const shippingClass = resolveShippingClass(product)
  if (shippingClass === 'install_only') return true
  return false
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe not configured'}),
    }
  }

  let payload: Record<string, any> = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const cart = Array.isArray(payload.cart) ? payload.cart : []
  const rawCartId =
    typeof payload.cartId === 'string'
      ? payload.cartId
      : typeof payload.cart_id === 'string'
        ? payload.cart_id
        : ''
  const cartId = rawCartId.trim() || `cart_${randomUUID()}`
  const cartType =
    typeof payload.cartType === 'string'
      ? payload.cartType.trim()
      : typeof payload.cart_type === 'string'
        ? payload.cart_type.trim()
        : 'storefront'
  const customerEmail =
    typeof payload.customerEmail === 'string' ? payload.customerEmail.trim() : undefined

  // Embedded Checkout with Parcelcraft dynamic rates (no static shipping options).
  if (!cart.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing cart'}),
    }
  }

  type NormalizedCartItem = {
    name: string
    quantity: number
    price?: number
    stripePriceId?: string
    images: string[]
    metadata: Stripe.MetadataParam
    sanityProductId?: string
  }

  const normalizedCart = cart
    .map((item: any): NormalizedCartItem | null => {
      if (!item || typeof item !== 'object') return null
      const quantity = resolveCartQuantity(item.quantity)
      const images = typeof item?.image === 'string' && item.image.trim() ? [item.image.trim()] : []
      const metadata: Stripe.MetadataParam = {}
      const sanityProductId =
        normalizeSanityId(
          item?._id ||
            item?.productId ||
            item?.product?._id ||
            item?.productRef?._ref ||
            item?.product?._ref,
        ) || undefined
      if (sanityProductId) metadata.sanity_product_id = sanityProductId
      const sku = typeof item?.sku === 'string' && item.sku.trim() ? item.sku.trim() : undefined
      if (sku) metadata.sku = sku
      const stripePriceId = item?.stripePriceId ? String(item.stripePriceId) : undefined
      const price = Number(item?.price)
      if (!stripePriceId && (!Number.isFinite(price) || price < 0)) return null
      return {
        name: item?.title || item?.name || 'Item',
        quantity,
        price: Number.isFinite(price) && price >= 0 ? price : undefined,
        stripePriceId,
        images,
        metadata,
        sanityProductId,
      }
    })
    .filter(Boolean) as NormalizedCartItem[]

  if (!normalizedCart.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'No valid line items in cart'}),
    }
  }

  const productIds = Array.from(
    new Set(
      normalizedCart.map((item) => item.sanityProductId).filter((id): id is string => Boolean(id)),
    ),
  )
  const stripePriceIds = Array.from(
    new Set(
      normalizedCart.map((item) => item.stripePriceId).filter((id): id is string => Boolean(id)),
    ),
  )

  let productMap = new Map<string, ProductShippingSnapshot>()
  if (productIds.length && sanity) {
    try {
      const products = await (sanity as ReturnType<typeof createClient>).fetch<
        ProductShippingSnapshot[]
      >(
        `*[_type == "product" && _id in $ids]{
          _id,
          title,
          shippingWeight,
          installOnly,
          shippingConfig{
            requiresShipping,
            weight,
            dimensions{
              length,
              width,
              height
            },
            shippingClass,
            installOnly
          }
        }`,
        {ids: productIds},
      )
      productMap = new Map((products || []).map((product) => [product._id, product]))
    } catch (err) {
      console.warn('createCheckoutSession: failed to load product shipping data', err)
    }
  }

  let stripePriceMap = new Map<string, Stripe.Price>()
  if (stripePriceIds.length && stripe) {
    try {
      const prices = await Promise.all(
        stripePriceIds.map((priceId) =>
          (stripe as Stripe).prices.retrieve(priceId, {expand: ['product']}),
        ),
      )
      stripePriceMap = new Map(prices.filter(Boolean).map((price) => [price.id, price]))
    } catch (err) {
      console.error('createCheckoutSession: failed to load Stripe prices', err)
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid Stripe price ID'}),
      }
    }
  }

  // Product metadata (weight, dimensions) is embedded in line items for Parcelcraft to read.
  // Parcelcraft calculates shipping dynamically based on this metadata and the shipping address.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
  for (const item of normalizedCart) {
    if (item.stripePriceId) {
      const price = stripePriceMap.get(item.stripePriceId)
      if (!price) {
        return {
          statusCode: 400,
          headers: {...CORS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Stripe price not found'}),
        }
      }
      const priceProduct = price.product
      const stripeProduct =
        priceProduct &&
        typeof priceProduct !== 'string' &&
        !('deleted' in priceProduct && priceProduct.deleted)
          ? priceProduct
          : undefined
      const productMeta = stripeProduct?.metadata || {}
      const product = item.sanityProductId ? productMap.get(item.sanityProductId) : undefined
      const requiresShipping = resolveRequiresShipping(product)
      const isShippable = requiresShipping === true

      if (isShippable) {
        if (price.type !== 'one_time' || !Number.isFinite(price.unit_amount ?? NaN)) {
          return {
            statusCode: 400,
            headers: {...CORS, 'Content-Type': 'application/json'},
            body: JSON.stringify({
              error: `Product "${item.name}" requires shipping but has invalid Stripe price configuration`,
            }),
          }
        }

        const metadata: Stripe.MetadataParam = {...productMeta, ...item.metadata}
        const productWeight = resolveProductWeight(product)

        if (!productWeight) {
          return {
            statusCode: 400,
            headers: {...CORS, 'Content-Type': 'application/json'},
            body: JSON.stringify({
              error: `Product "${item.name}" (${item.sanityProductId || 'unknown'}) requires shipping but has no weight configured in Sanity. Please add weight to shippingConfig.`,
            }),
          }
        }

        metadata.shipping_required = 'true'
        metadata.weight = productWeight.toString()
        metadata.weight_unit = 'pound'
        metadata.origin_country = metadata.origin_country || 'US'
        metadata.customs_description = metadata.customs_description || 'Auto-parts'
        metadata.company = 'F.A.S. Motorsports LLC'

        const shippingClass = resolveShippingClass(product)
        if (shippingClass) {
          metadata.shipping_class = shippingClass
        }

        const installOnly = resolveInstallOnly(product)
        if (installOnly) {
          metadata.install_only = 'true'
        }

        if (item.sanityProductId) {
          metadata.sanityProductId = item.sanityProductId
        }

        const dims = resolveProductDimensions(product)
        if (dims) {
          metadata.length = dims.length.toString()
          metadata.width = dims.width.toString()
          metadata.height = dims.height.toString()
        }

        lineItems.push({
          price_data: {
            currency: price.currency,
            product_data: {
              name: stripeProduct?.name || item.name || 'Item',
              images: item.images.length ? item.images : stripeProduct?.images || [],
              metadata,
            },
            unit_amount: price.unit_amount ?? 0,
            tax_behavior: price.tax_behavior || 'exclusive',
          },
          quantity: item.quantity,
        })
      } else {
        const metadata: Stripe.MetadataParam = {...productMeta, ...item.metadata}
        metadata.shipping_required = 'false'
        if (item.sanityProductId) {
          metadata.sanityProductId = item.sanityProductId
        }

        lineItems.push({
          price_data: {
            currency: price.currency,
            product_data: {
              name: stripeProduct?.name || item.name || 'Item',
              images: item.images.length ? item.images : stripeProduct?.images || [],
              metadata,
            },
            unit_amount: price.unit_amount ?? 0,
            tax_behavior: price.tax_behavior || 'exclusive',
          },
          quantity: item.quantity,
        })
      }
      continue
    }

    if (typeof item.price !== 'number') {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid line item price'}),
      }
    }
    const unitAmount = Math.round(item.price * 100)
    if (!Number.isFinite(unitAmount) || unitAmount < 0) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid line item price'}),
      }
    }
    const product = item.sanityProductId ? productMap.get(item.sanityProductId) : undefined
    const requiresShipping = resolveRequiresShipping(product)
    const isShippable = requiresShipping === true
    const metadata: Stripe.MetadataParam = {...item.metadata}

    if (item.sanityProductId) {
      metadata.sanityProductId = item.sanityProductId
    }

    if (isShippable) {
      const productWeight = resolveProductWeight(product)

      if (!productWeight) {
        return {
          statusCode: 400,
          headers: {...CORS, 'Content-Type': 'application/json'},
          body: JSON.stringify({
            error: `Product "${item.name}" (${item.sanityProductId || 'unknown'}) requires shipping but has no weight configured in Sanity. Please add weight to shippingConfig.`,
          }),
        }
      }

      metadata.shipping_required = 'true'
      metadata.weight = productWeight.toString()
      metadata.weight_unit = 'pound'
      metadata.origin_country = 'US'
      metadata.customs_description = 'Auto-parts'

      const shippingClass = resolveShippingClass(product)
      if (shippingClass) {
        metadata.shipping_class = shippingClass
      }

      const installOnly = resolveInstallOnly(product)
      if (installOnly) {
        metadata.install_only = 'true'
      }

      const dims = resolveProductDimensions(product)
      if (dims) {
        metadata.length = dims.length.toString()
        metadata.width = dims.width.toString()
        metadata.height = dims.height.toString()
      }
    } else {
      metadata.shipping_required = 'false'
    }

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: product?.title || item.name || 'Item',
          images: item.images,
          metadata,
        },
        unit_amount: unitAmount,
        tax_behavior: 'exclusive',
      },
      quantity: item.quantity,
    })
  }

  if (!lineItems.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'No valid line items in cart'}),
    }
  }

  // Product metadata (weight, dimensions) is set in line items for Parcelcraft.

  const itemCount = normalizedCart.reduce((total, item) => total + item.quantity, 0)
  const subtotalEstimate = normalizedCart.reduce((total, item) => {
    if (typeof item.price !== 'number') return total
    return total + item.price * item.quantity
  }, 0)
  // Shipping cost will be calculated by Parcelcraft and added to the session total
  const estimatedTotal = subtotalEstimate

  const sessionMetadata: Stripe.MetadataParam = {
    cart_id: cartId,
    cart_type: cartType || 'storefront',
    order_type: cartType || 'storefront',
    item_count: String(itemCount),
    est_total: estimatedTotal.toFixed(2),
  }

  const baseUrl = (process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com').replace(/\/+$/, '')

  const captureMethod: 'automatic' = 'automatic'
  const hasShippableItems = normalizedCart.some((item) => {
    if (!item.sanityProductId) return true
    const product = productMap.get(item.sanityProductId)
    const requiresShipping = resolveRequiresShipping(product)
    return requiresShipping === true
  })
  const shipStatus: 'unshipped' | 'unshippable' | 'shipped' | 'back_ordered' | 'canceled' =
    hasShippableItems ? 'unshipped' : 'unshippable'

  const isReturn: boolean = Boolean(payload.isReturn || payload.is_return)
  if (isReturn) sessionMetadata.is_return = 'false'

  sessionMetadata.ship_status = shipStatus
  sessionMetadata.shipping_required = hasShippableItems ? 'true' : 'false'

  const shipmentIds = [
    'ca_ec65ddeb7dcc43eca9fa42870662751f',
    'ca_ed4230c54cc44385a518e8274f0cdc1e',
    'ca_d6f01c95df834796822516afe2e05771',
  ]

  const paymentIntentMetadata: Stripe.MetadataParam = {
    cart_id: cartId,
    ship_status: shipStatus,
    package_code: hasShippableItems ? 'Package' : 'None',
    ship_date: hasShippableItems ? new Date().toISOString().split('T')[0] : 'N/A',
    shipment_ids: shipmentIds.join(','),
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe not configured'}),
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: cartId,
      customer_email: customerEmail,
      line_items: lineItems,

      // Shipping address collection is required for Parcelcraft to calculate rates.
      shipping_address_collection: {
        allowed_countries: ['US'],
      },

      custom_fields: [
        {
          key: 'company',
          label: {type: 'custom', custom: 'Company'},
          type: 'text',
          optional: true,
        },
      ],

      // 4. PARCELCRAFT REQUIREMENTS
      // invoice_creation is required so Parcelcraft can read the weight/dims later
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: {
            ...sessionMetadata,
            cart_type: cartType || 'storefront',
          },
        },
      },

      payment_intent_data: {
        capture_method: captureMethod,
        metadata: paymentIntentMetadata, // Includes 'ship_status: unshipped' or 'unshippable' or 'canceled' or 'shipped' or 'back_ordered'
      },

      metadata: sessionMetadata,
      billing_address_collection: 'required',
      phone_number_collection: {enabled: true},
      return_url: `${baseUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    })

    if (sanity) {
      const nowIso = new Date().toISOString()
      const cartSnapshot = cart.map((item: any): any => {
        if (!item || typeof item !== 'object') return null
        const quantity = resolveCartQuantity(item.quantity)
        const productId = normalizeSanityId(item?._id || item?.productId)
        const price = typeof item?.price === 'number' ? item.price : undefined
        const total = price !== undefined ? price * quantity : undefined
        const entry: Record<string, any> = {
          name: item?.title || item?.name || item?.sku || 'Item',
          sku: typeof item?.sku === 'string' ? item.sku.trim() : undefined,
          id: item?._id || item?.productId,
          image: typeof item?.image === 'string' ? item.image.trim() : undefined,
          price,
          quantity,
          total,
        }
        if (productId) {
          entry.productRef = {_type: 'reference', _ref: productId}
        }
        return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined))
      })
      const cleanCart = cartSnapshot.filter(Boolean)
      try {
        await sanity.createIfNotExists({
          _id: cartId,
          _type: 'checkoutSession',
          sessionId: session.id,
          status: session.status || 'open',
          createdAt: nowIso,
        })
        await sanity
          .patch(cartId)
          .set({
            sessionId: session.id,
            status: session.status || 'open',
            createdAt: nowIso,
            expiresAt: session.expires_at
              ? new Date(session.expires_at * 1000).toISOString()
              : undefined,
            customerEmail: customerEmail || undefined,
            cart: cleanCart.length ? cleanCart : undefined,
            amountSubtotal: subtotalEstimate || undefined,
            // Shipping amount will be determined by Parcelcraft and available after checkout completion
            totalAmount: estimatedTotal || undefined,
            currency: 'USD',
            stripeCheckoutUrl: session.url || undefined,
          })
          .setIfMissing({recoveryEmailSent: false, recovered: false})
          .commit({autoGenerateArrayKeys: true})
      } catch (err) {
        console.warn('createCheckoutSession: failed to persist cart snapshot', err)
      }
    }

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        sessionId: session.id,
        clientSecret: session.client_secret,
        url: session.url,
      }),
    }
  } catch (err: any) {
    console.error('createCheckoutSession error:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Failed to create checkout'}),
    }
  }
}
