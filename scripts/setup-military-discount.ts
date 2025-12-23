import Stripe from 'stripe'
import {resolveStripeSecretKey} from '../netlify/lib/stripeEnv'

const stripeSecret = resolveStripeSecretKey()
if (!stripeSecret) {
  throw new Error('Missing Stripe secret key. Set STRIPE_SECRET_KEY (or compatible env).')
}

const stripe = new Stripe(stripeSecret, {apiVersion: '2024-06-20'})

async function setupMilitaryDiscount() {
  try {
    const coupon = await stripe.coupons.create({
      percent_off: 10,
      duration: 'once',
      name: 'Military Discount - 10% Off',
      metadata: {
        type: 'military',
        program: 'military_verification',
        created_by: 'setup_script',
      },
    })

    console.log('✓ Military discount coupon created:', coupon.id)
    console.log('  Add this to your environment:')
    console.log(`  STRIPE_MILITARY_COUPON_ID=${coupon.id}`)
  } catch (error) {
    console.error('✗ Error creating coupon:', error)
    throw error
  }
}

setupMilitaryDiscount()
