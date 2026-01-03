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
  const email = session.customer_details?.email ?? session.customer_email ?? null
  const name =
    session.customer_details?.name ??
    (session.customer_details as {individual_name?: string} | null | undefined)
      ?.individual_name ??
    null
  const phone = session.customer_details?.phone ?? null

  if (session.metadata?.cart_id) {
    await patchProductTable([
      {
        _key: session.metadata.cart_id,
        cartId: session.metadata.cart_id,
        status: 'expired',
        email,
        name,
        phone,
        checkoutSessionId: session.id,
        expiredAt: new Date(session.expires_at * 1000).toISOString(),
        livemode: session.livemode,
        recovery: {
          recovered: false,
          recoveredAt: null,
          recoveredSessionId: null,
        },
      },
    ])
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: true,
      event: 'checkout.session.expired',
    }),
  }
}
