import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET!,
  token: process.env.SANITY_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const parseCartItems = (lineItems: Stripe.LineItem[]) => {
  return lineItems.map((item) => {
    const metadata = item.price?.metadata || {}

    const actualSku =
      metadata.sku ||
      metadata.sanity_product_id ||
      metadata.sanity_product_id_actual ||
      item.price?.id

    const selectedVariant =
      metadata.option_platform || metadata.option_vehicle || metadata.option2_value || ''

    const addOns: string[] = []
    if (metadata.addon_1) addOns.push(metadata.addon_1)
    if (metadata.addon_2) addOns.push(metadata.addon_2)
    if (metadata.addon_3) addOns.push(metadata.addon_3)

    return {
      _type: 'orderCartItem',
      _key: item.id,
      name: item.description || 'Unknown Product',
      sku: actualSku,
      image: metadata.product_image || '',
      quantity: item.quantity || 1,
      price: (item.price?.unit_amount || 0) / 100,
      total: (item.amount_total || 0) / 100,
      selectedVariant,
      addOns: addOns.length > 0 ? addOns : null,
    }
  })
}

const fixWilliamOrder = async () => {
  const orderId = 'drafts.4e3xl4aFRE2qSir4YQsODx'
  const sessionId = 'cs_live_a1S9BXJFzpFSKO80qgDyOGmQRsklw3NuAkE30ZunRgCaPAidg14LTxpoNx'
  const chargeId = 'ch_3SbBzdP1CiCjkLwl12bHbuLQ' // From latest_charge

  console.log('=== STEP 1: Fetch Session ===')
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'line_items.data.price'],
  })
  console.log('✅ Session retrieved')
  console.log('   Line items:', session.line_items?.data.length || 0)

  console.log('\n=== STEP 2: Fetch Charge Directly ===')
  const charge = await stripe.charges.retrieve(chargeId)
  console.log('✅ Charge retrieved')
  console.log('   Charge ID:', charge.id)
  console.log('   Amount:', charge.amount / 100)
  console.log('   Status:', charge.status)

  const card = charge.payment_method_details?.card
  const billingDetails = charge.billing_details
  const billingAddress = billingDetails?.address

  console.log('\n=== STEP 3: Card Details ===')
  console.log('   Brand:', card?.brand || 'NOT FOUND')
  console.log('   Last 4:', card?.last4 || 'NOT FOUND')
  console.log('   Receipt URL:', charge.receipt_url || 'NOT FOUND')

  console.log('\n=== STEP 4: Billing Address ===')
  if (billingAddress) {
    console.log('   Name:', billingDetails?.name)
    console.log('   Email:', billingDetails?.email)
    console.log('   Address:', billingAddress.line1)
    console.log('   City:', billingAddress.city)
    console.log('   State:', billingAddress.state)
    console.log('   Zip:', billingAddress.postal_code)
  } else {
    console.log('   ⚠️  No billing address found')
  }

  console.log('\n=== STEP 5: Parse Cart Items ===')
  const lineItems = session.line_items?.data || []
  const parsedCart = parseCartItems(lineItems)

  parsedCart.forEach((item: any, index: number) => {
    console.log(`   Item ${index + 1}:`, item.name)
    console.log('     SKU:', item.sku)
    console.log('     Price: $' + item.price)
    console.log('     Qty:', item.quantity)
    console.log('     Total: $' + item.total)
    console.log('     Variant:', item.selectedVariant || 'none')
  })

  console.log('\n=== STEP 6: Build Update Object ===')
  const updates: any = {
    cardBrand: card?.brand || '',
    cardLast4: card?.last4 || '',
    receiptUrl: charge.receipt_url || '',
    cart: parsedCart,
  }

  if (billingAddress) {
    updates.billingAddress = {
      name: billingDetails?.name || '',
      phone: billingDetails?.phone || '',
      email: billingDetails?.email || '',
      addressLine1: billingAddress.line1 || '',
      addressLine2: billingAddress.line2 || '',
      city: billingAddress.city || '',
      state: billingAddress.state || '',
      postalCode: billingAddress.postal_code || '',
      country: billingAddress.country || '',
    }
    console.log('   ✅ Billing address included')
  }

  console.log('   ✅ Update object ready')
  console.log('   Fields to update:', Object.keys(updates).join(', '))

  console.log('\n=== STEP 7: Update Sanity ===')
  console.log('   Order ID:', orderId)

  const result = await sanity.patch(orderId).set(updates).commit()

  console.log('\n🎉 SUCCESS! Order updated')
  console.log('   Revision:', result._rev)

  console.log('\n=== FINAL SUMMARY ===')
  console.log('✅ Card:', updates.cardBrand, '••••', updates.cardLast4)
  console.log('✅ Receipt URL:', updates.receiptUrl ? 'Added' : 'Missing')
  console.log('✅ Billing address:', updates.billingAddress ? 'Added' : 'Missing')
  console.log('✅ Cart items:', updates.cart.length)

  console.log('\n=== CART DETAILS ===')
  updates.cart.forEach((item: any) => {
    console.log(`✅ ${item.name}`)
    console.log(`   SKU: ${item.sku}`)
    console.log(`   Total: $${item.total}`)
    console.log(`   Variant: ${item.selectedVariant || 'none'}`)
  })

  console.log('\n✅ ALL DONE! Check the order in Sanity Studio.')
}

fixWilliamOrder().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error)
  console.error('\nStack trace:', error.stack)
})
