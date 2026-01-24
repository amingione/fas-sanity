/**
 * Test script to validate checkout session enhancements
 * 
 * This script validates that:
 * 1. CheckoutSession documents are created with all required fields
 * 2. Attribution data is properly captured
 * 3. Webhook handlers update documents correctly
 */

import {createClient} from '@sanity/client'

const sanityClient = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

interface CheckoutSessionValidation {
  hasRequiredFields: boolean
  hasCustomerInfo: boolean
  hasCartData: boolean
  hasAttribution: boolean
  issues: string[]
}

async function validateCheckoutSession(sessionId: string): Promise<CheckoutSessionValidation> {
  const issues: string[] = []
  
  const session = await sanityClient.fetch<any>(
    `*[_type == "checkoutSession" && sessionId == $sessionId][0]{
      _id,
      sessionId,
      status,
      createdAt,
      expiresAt,
      customerEmail,
      customerName,
      customerPhone,
      cart,
      amountSubtotal,
      totalAmount,
      currency,
      attribution,
      metadata,
      stripeCheckoutUrl
    }`,
    {sessionId}
  )

  if (!session) {
    issues.push('CheckoutSession document not found')
    return {
      hasRequiredFields: false,
      hasCustomerInfo: false,
      hasCartData: false,
      hasAttribution: false,
      issues,
    }
  }

  // Check required fields
  const hasRequiredFields = !!(
    session.sessionId &&
    session.status &&
    session.createdAt
  )

  if (!hasRequiredFields) {
    if (!session.sessionId) issues.push('Missing sessionId')
    if (!session.status) issues.push('Missing status')
    if (!session.createdAt) issues.push('Missing createdAt')
  }

  // Check customer info
  const hasCustomerInfo = !!(
    session.customerEmail ||
    session.customerName ||
    session.customerPhone
  )

  if (!hasCustomerInfo) {
    issues.push('Missing customer information (email, name, or phone)')
  }

  // Check cart data
  const hasCartData = !!(
    Array.isArray(session.cart) &&
    session.cart.length > 0
  )

  if (!hasCartData) {
    issues.push('Missing or empty cart data')
  }

  // Check attribution
  const hasAttribution = !!(
    session.attribution &&
    typeof session.attribution === 'object'
  )

  if (!hasAttribution) {
    issues.push('Missing attribution data')
  }

  return {
    hasRequiredFields,
    hasCustomerInfo,
    hasCartData,
    hasAttribution,
    issues,
  }
}

async function validateAbandonedCheckout(stripeSessionId: string): Promise<{
  exists: boolean
  hasCompleteData: boolean
  issues: string[]
}> {
  const issues: string[] = []
  
  const abandoned = await sanityClient.fetch<any>(
    `*[_type == "abandonedCheckout" && stripeSessionId == $sessionId][0]{
      _id,
      stripeSessionId,
      status,
      customerEmail,
      cart,
      cartSummary,
      amountSubtotal,
      sessionMetadata
    }`,
    {sessionId: stripeSessionId}
  )

  if (!abandoned) {
    return {
      exists: false,
      hasCompleteData: false,
      issues: ['AbandonedCheckout document not found'],
    }
  }

  const hasCompleteData = !!(
    abandoned.customerEmail &&
    Array.isArray(abandoned.cart) &&
    abandoned.cart.length > 0 &&
    abandoned.cartSummary
  )

  if (!hasCompleteData) {
    if (!abandoned.customerEmail) issues.push('Missing customerEmail')
    if (!Array.isArray(abandoned.cart) || abandoned.cart.length === 0) {
      issues.push('Missing or empty cart')
    }
    if (!abandoned.cartSummary) issues.push('Missing cartSummary')
  }

  return {
    exists: true,
    hasCompleteData,
    issues,
  }
}

async function main() {
  console.log('🔍 Validating Checkout Session Enhancements\n')

  // Fetch recent checkout sessions to test
  const recentSessions = await sanityClient.fetch<Array<{sessionId: string; status: string}>>(
    `*[_type == "checkoutSession"] | order(createdAt desc)[0...5]{sessionId, status}`
  )

  if (recentSessions.length === 0) {
    console.log('⚠️  No checkout sessions found to validate')
    return
  }

  console.log(`Found ${recentSessions.length} recent checkout sessions to validate\n`)

  for (const session of recentSessions) {
    console.log(`\n📋 Validating session: ${session.sessionId}`)
    console.log(`   Status: ${session.status}`)

    const validation = await validateCheckoutSession(session.sessionId)

    console.log(`   ✓ Required fields: ${validation.hasRequiredFields ? '✅' : '❌'}`)
    console.log(`   ✓ Customer info: ${validation.hasCustomerInfo ? '✅' : '❌'}`)
    console.log(`   ✓ Cart data: ${validation.hasCartData ? '✅' : '❌'}`)
    console.log(`   ✓ Attribution: ${validation.hasAttribution ? '✅' : '❌'}`)

    if (validation.issues.length > 0) {
      console.log(`   ⚠️  Issues found:`)
      validation.issues.forEach(issue => console.log(`      - ${issue}`))
    }

    // Check for abandoned checkout if expired
    if (session.status === 'expired') {
      const abandonedValidation = await validateAbandonedCheckout(session.sessionId)
      console.log(`   ✓ AbandonedCheckout exists: ${abandonedValidation.exists ? '✅' : '❌'}`)
      if (abandonedValidation.exists) {
        console.log(`   ✓ AbandonedCheckout complete: ${abandonedValidation.hasCompleteData ? '✅' : '❌'}`)
        if (abandonedValidation.issues.length > 0) {
          console.log(`   ⚠️  AbandonedCheckout issues:`)
          abandonedValidation.issues.forEach(issue => console.log(`      - ${issue}`))
        }
      }
    }
  }

  console.log('\n✅ Validation complete')
}

main().catch(err => {
  console.error('❌ Validation failed:', err)
  process.exit(1)
})
