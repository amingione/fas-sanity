import Stripe from 'stripe'
import {createClient} from '@sanity/client'

const sanityClient = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const patchProductTable = async (carts: Array<Record<string, unknown>>): Promise<void> => {
  if (!Array.isArray(carts) || carts.length === 0) return
  await sanityClient.createIfNotExists({
    _id: 'productTable',
    _type: 'productTable',
    carts: [],
  })
  await sanityClient
    .patch('productTable')
    .setIfMissing({carts: []})
    .append('carts', carts)
    .commit()
}

/**
 * 🔒 CART-ONLY EVENT — ENFORCED BY TESTS + SCHEMA
 *
 * checkout.session.expired MUST NOT:
 * - create orders
 * - create invoices
 * - touch payments
 * - trigger fulfillment
 *
 * Any regression MUST fail CI.
 */
export async function handleCheckoutSessionExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session
  const metadata = (session.metadata || {}) as Record<string, string>
  const cartId =
    (typeof metadata.cart_id === 'string' && metadata.cart_id.trim()) ||
    (typeof session.client_reference_id === 'string' && session.client_reference_id.trim()) ||
    ''
  if (!cartId) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        received: true,
        event: 'checkout.session.expired',
      }),
    }
  }

  const cartDoc = await sanityClient.fetch<{
    _id: string
    customerEmail?: string | null
    customerName?: string | null
    customerPhone?: string | null
    cart?: any[] | null
    amountSubtotal?: number | null
    totalAmount?: number | null
    attribution?: any | null
  } | null>(
    `*[_type == "checkoutSession" && _id == $id][0]{
      _id, 
      customerEmail, 
      customerName, 
      customerPhone, 
      cart, 
      amountSubtotal, 
      totalAmount,
      attribution
    }`,
    {id: cartId},
  )
  const customerDetails =
    session.customer_details || (event.data.object as any)?.customer_details || null

  const expiredAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : new Date().toISOString()

  const customerEmail = cartDoc?.customerEmail || customerDetails?.email || undefined
  const customerName = cartDoc?.customerName || customerDetails?.name || undefined
  const customerPhone = cartDoc?.customerPhone || customerDetails?.phone || undefined

  // Update the checkoutSession document with expiration data
  if (cartDoc?._id) {
    const updateData: Record<string, any> = {
      status: 'expired',
      expiredAt,
      sessionId: session.id,
      stripeCheckoutUrl: (session as any)?.url || undefined,
    }

    // Add customer details from session if not already present
    if (!cartDoc.customerEmail && customerEmail) updateData.customerEmail = customerEmail
    if (!cartDoc.customerName && customerName) updateData.customerName = customerName
    if (!cartDoc.customerPhone && customerPhone) updateData.customerPhone = customerPhone

    await sanityClient
      .patch(cartDoc._id)
      .set(updateData)
      .setIfMissing({recoveryEmailSent: false, recovered: false})
      .commit({autoGenerateArrayKeys: true})
  } else {
    await sanityClient.createIfNotExists({
      _id: cartId,
      _type: 'checkoutSession',
      sessionId: session.id,
      status: 'expired',
      createdAt: new Date().toISOString(),
      expiredAt,
      customerEmail,
      customerName,
      customerPhone,
      stripeCheckoutUrl: (session as any)?.url || undefined,
    })
  }

  // Create an abandonedCheckout document if cart has value
  const hasCart = Array.isArray(cartDoc?.cart) && cartDoc.cart.length > 0
  const hasValue =
    (typeof cartDoc?.amountSubtotal === 'number' && cartDoc.amountSubtotal > 0) ||
    (typeof cartDoc?.totalAmount === 'number' && cartDoc.totalAmount > 0)

  if (hasCart && (customerEmail || hasValue)) {
    try {
      const abandonedCheckoutId = `abandoned_${cartId}`
      const cartSummary = Array.isArray(cartDoc.cart)
        ? cartDoc.cart
            .map(
              (item: any) =>
                `${item.quantity || 1}x ${item.name || item.sku || 'Item'} @ $${item.price?.toFixed(2) || '0.00'}`,
            )
            .join(', ')
        : undefined

      await sanityClient.createIfNotExists({
        _id: abandonedCheckoutId,
        _type: 'abandonedCheckout',
        checkoutId: cartId,
        stripeSessionId: session.id,
        status: 'expired',
        customerEmail,
        customerName,
        customerPhone,
        cart: cartDoc.cart || [],
        cartSummary,
        amountSubtotal: cartDoc.amountSubtotal || undefined,
        amountTotal: cartDoc.totalAmount || undefined,
        sessionMetadata: cartDoc.attribution
          ? {
              browser: cartDoc.attribution.browser || undefined,
              device: cartDoc.attribution.device || undefined,
              os: cartDoc.attribution.os || undefined,
              landingPage: cartDoc.attribution.landingPage || undefined,
              referrer: cartDoc.attribution.referrer || undefined,
            }
          : undefined,
        sessionCreatedAt: session.created ? new Date(session.created * 1000).toISOString() : undefined,
        sessionExpiredAt: expiredAt,
        recoveryEmailSent: false,
      })

      console.log('handleCheckoutSessionExpired: created abandonedCheckout', {
        abandonedCheckoutId,
        cartId,
        sessionId: session.id,
      })
    } catch (err) {
      console.warn('handleCheckoutSessionExpired: failed to create abandonedCheckout', err)
    }
  }

  await patchProductTable([
    {
      _key: cartId,
      cartId,
      status: 'expired',
      email: customerEmail || null,
      name: customerName || null,
      phone: customerPhone || null,
      checkoutSessionId: session.id,
      expiredAt,
      livemode: session.livemode,
      recovery: {
        recovered: false,
        recoveredAt: null,
        recoveredSessionId: null,
      },
    },
  ])

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: true,
      event: 'checkout.session.expired',
    }),
  }
}
