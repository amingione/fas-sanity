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
  } | null>(`*[_type == "checkoutSession" && _id == $id][0]`, {id: cartId})

  const expiredAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : new Date().toISOString()

  if (cartDoc?._id) {
    await sanityClient
      .patch(cartDoc._id)
      .set({
        status: 'expired',
        expiredAt,
        sessionId: session.id,
        stripeCheckoutUrl: (session as any)?.url || undefined,
      })
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
      stripeCheckoutUrl: (session as any)?.url || undefined,
    })
  }

  await patchProductTable([
    {
      _key: cartId,
      cartId,
      status: 'expired',
      email: cartDoc?.customerEmail || null,
      name: cartDoc?.customerName || null,
      phone: cartDoc?.customerPhone || null,
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
