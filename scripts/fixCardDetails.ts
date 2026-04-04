#!/usr/bin/env tsx
import {createClient} from '@sanity/client'
import {requireSanityCredentials} from '../lib/sanityEnv'
import {parseStripeSummaryData} from '../lib/stripeSummary'

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
  stripeSummary?: {data?: string | null} | Record<string, any> | null
}

async function fixCardDetails() {
  const orders = await sanity.fetch<OrderCardDetails[]>(
    `*[_type == "order" && defined(stripeSummary.data) && (
      cardBrand == "" || !defined(cardBrand) || cardLast4 == "" || !defined(cardLast4)
    )]{
      _id,
      orderNumber,
      cardBrand,
      cardLast4,
      stripeSummary
    }`,
  )

  let updated = 0
  for (const order of orders) {
    const summary = parseStripeSummaryData(order.stripeSummary)
    const brand = (summary?.paymentMethod?.brand || '').trim()
    const last4 = (summary?.paymentMethod?.last4 || '').trim()
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
