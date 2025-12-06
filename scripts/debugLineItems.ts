import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
})

const debug = async () => {
  const sessionId = 'cs_live_a1S9BXJFzpFSKO80qgDyOGmQRsklw3NuAkE30ZunRgCaPAidg14LTxpoNx'

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'line_items.data.price'],
  })

  const lineItems = session.line_items?.data || []

  console.log('Line items found:', lineItems.length)

  lineItems.forEach((item, index) => {
    console.log(`\n=== Item ${index + 1} ===`)
    console.log('Description:', item.description)
    console.log('Price ID:', item.price?.id)
    console.log('Metadata:', JSON.stringify(item.price?.metadata, null, 2))
  })
}

debug().catch(console.error)
