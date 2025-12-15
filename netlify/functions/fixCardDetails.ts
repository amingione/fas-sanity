#!/usr/bin/env tsx
import {createClient} from '@sanity/client'
import {requireSanityCredentials} from '../lib/sanityEnv'

const {projectId, dataset, token} = requireSanityCredentials()

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

type OrderCardDetails = {
  _id: string
  orderNumber?: string
  cardBrand?: string | null
  cardLast4?: string | null
  brand?: string | null
  last4?: string | null
}

async function fixCardDetails() {
  const orders = await sanity.fetch<OrderCardDetails[]>(
    `*[_type == "order" && defined(stripeSummary.paymentMethod.brand)]{
      _id,
      orderNumber,
      cardBrand,
      cardLast4,
      "brand": stripeSummary.paymentMethod.brand,
      "last4": stripeSummary.paymentMethod.last4
    }`,
  )

  let updated = 0
  for (const order of orders) {
    const brand = (order.brand || '').trim()
    const last4 = (order.last4 || '').trim()
    if (!brand || !last4) continue
    const hasSameBrand = (order.cardBrand || '').trim() === brand
    const hasSameLast4 = (order.cardLast4 || '').trim() === last4
    if (hasSameBrand && hasSameLast4) continue

    await sanity
      .patch(order._id)
      .set({
        cardBrand: brand,
        cardLast4: last4,
      })
      .commit({autoGenerateArrayKeys: true})

    updated += 1
    console.log(`Fixed ${order.orderNumber || order._id}: ${brand} •••• ${last4}`)
  }

  console.log(`Done. Updated ${updated} order${updated === 1 ? '' : 's'}.`)
}

fixCardDetails().catch((err) => {
  console.error('Failed to backfill card details', err)
  process.exit(1)
})
