// netlify/functions/masterBackfill.ts
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {requireSanityCredentials} from '../lib/sanityEnv.js'
import {parseStripeSummaryData} from '../lib/stripeSummary'

const {projectId, dataset, token} = requireSanityCredentials()
const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

interface BackfillStats {
  total: number
  fixed: number
  skipped: number
  cardDetailsFixed: number
  shippingAddressFixed: number
  billingAddressFixed: number
  packageWeightFixed: number
  packageDimensionsFixed: number
  errors: Array<{orderId: string; orderNumber?: string; error: string}>
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

function extractCardDetails(doc: any): {brand?: string; last4?: string} | null {
  const stripeSummary = parseStripeSummaryData(doc?.stripeSummary)
  const pm = stripeSummary?.paymentMethod
  if (pm?.brand && pm?.last4) {
    return {brand: pm.brand, last4: pm.last4}
  }

  const metadata = stripeSummary?.metadata
  if (Array.isArray(metadata)) {
    for (const entry of metadata) {
      if (entry.key === 'payment_method_brand' && entry.value) {
        const brand = entry.value
        const last4Entry = metadata.find((e: any) => e.key === 'payment_method_last4')
        if (last4Entry?.value) {
          return {brand, last4: last4Entry.value}
        }
      }
    }
  }

  return null
}

function extractCompleteShippingAddress(doc: any): any | null {
  const existing = doc?.shippingAddress
  const stripeSummary = parseStripeSummaryData(doc?.stripeSummary)?.shippingAddress

  if (existing?.addressLine1 && existing?.city && existing?.state && existing?.postalCode) {
    return null
  }

  if (stripeSummary) {
    return {
      name: stripeSummary.name || existing?.name || doc?.customerName || '',
      email: stripeSummary.email || existing?.email || doc?.customerEmail || '',
      phone: stripeSummary.phone || existing?.phone || '',
      addressLine1: stripeSummary.line1 || existing?.addressLine1 || '',
      addressLine2: stripeSummary.line2 || existing?.addressLine2 || '',
      city: stripeSummary.city || existing?.city || '',
      state: stripeSummary.state || existing?.state || '',
      postalCode:
        stripeSummary.postalCode || stripeSummary.postal_code || existing?.postalCode || '',
      country: stripeSummary.country || existing?.country || 'US',
    }
  }

  return null
}

function extractCompleteBillingAddress(doc: any): any | null {
  const existing = doc?.billingAddress
  const stripeSummary = parseStripeSummaryData(doc?.stripeSummary)?.billingAddress

  if (existing?.addressLine1 && existing?.city && existing?.state && existing?.postalCode) {
    return null
  }

  if (stripeSummary) {
    return {
      name: stripeSummary.name || existing?.name || doc?.customerName || '',
      email: stripeSummary.email || existing?.email || doc?.customerEmail || '',
      phone: stripeSummary.phone || existing?.phone || '',
      addressLine1: stripeSummary.line1 || existing?.addressLine1 || '',
      addressLine2: stripeSummary.line2 || existing?.addressLine2 || '',
      city: stripeSummary.city || existing?.city || '',
      state: stripeSummary.state || existing?.state || '',
      postalCode:
        stripeSummary.postalCode || stripeSummary.postal_code || existing?.postalCode || '',
      country: stripeSummary.country || existing?.country || 'US',
    }
  }

  return null
}

function calculatePackageWeight(cart: any[], existingWeight?: number | null): number | null {
  if (existingWeight && existingWeight > 0) {
    return null
  }
  if (!Array.isArray(cart) || cart.length === 0) return null

  let totalWeight = 0
  let hasWeight = false

  for (const item of cart) {
    const weight = Number(item?.weight || 0)
    const quantity = Number(item?.quantity || 1)
    if (weight > 0) {
      totalWeight += weight * quantity
      hasWeight = true
    }
  }

  return hasWeight ? Number((totalWeight + 1).toFixed(2)) : null
}

function calculatePackageDimensions(
  cart: any[],
  existingDims?: any,
): {length: number; width: number; height: number} | null {
  const isDefault =
    existingDims?.length === 12 && existingDims?.width === 9 && existingDims?.height === 6

  if (existingDims && !isDefault) {
    return null
  }

  if (!Array.isArray(cart) || cart.length === 0) {
    return {length: 12, width: 9, height: 6}
  }

  let maxLength = 0
  let maxWidth = 0
  let stackedHeight = 0
  let hasDimensions = false

  for (const item of cart) {
    const dims = item?.dimensions
    if (dims && typeof dims === 'object') {
      const length = Number(dims.length || 0)
      const width = Number(dims.width || 0)
      const height = Number(dims.height || 0)
      if (length > 0 && width > 0 && height > 0) {
        const quantity = Number(item?.quantity || 1)
        maxLength = Math.max(maxLength, length)
        maxWidth = Math.max(maxWidth, width)
        stackedHeight += height * quantity
        hasDimensions = true
      }
    }
  }

  if (!hasDimensions) {
    return {length: 12, width: 9, height: 6}
  }

  return {
    length: Number((maxLength + 2).toFixed(2)),
    width: Number((maxWidth + 2).toFixed(2)),
    height: Number((stackedHeight + 2).toFixed(2)),
  }
}

// ============================================================================
// BACKFILL LOGIC
// ============================================================================

async function backfillOrder(doc: any, stats: BackfillStats, dryRun: boolean): Promise<void> {
  const patches: Record<string, any> = {}
  let changesMade = false

  if (!doc.cardBrand || doc.cardBrand === 'unknown' || !doc.cardLast4 || doc.cardLast4 === 'unknown') {
    const cardDetails = extractCardDetails(doc)
    if (cardDetails) {
      const updated: Record<string, any> = {}
      if (cardDetails.brand && (!doc.cardBrand || doc.cardBrand === 'unknown')) {
        updated.cardBrand = cardDetails.brand
      }
      if (cardDetails.last4 && (!doc.cardLast4 || doc.cardLast4 === 'unknown')) {
        updated.cardLast4 = cardDetails.last4
      }
      if (Object.keys(updated).length) {
        Object.assign(patches, updated)
        stats.cardDetailsFixed++
        changesMade = true
      }
    }
  }

  const completeShippingAddress = extractCompleteShippingAddress(doc)
  if (completeShippingAddress) {
    patches.shippingAddress = completeShippingAddress
    stats.shippingAddressFixed++
    changesMade = true
  }

  const completeBillingAddress = extractCompleteBillingAddress(doc)
  if (completeBillingAddress) {
    patches.billingAddress = completeBillingAddress
    stats.billingAddressFixed++
    changesMade = true
  }

  const calculatedWeight = calculatePackageWeight(doc.cart, doc.packageWeight)
  if (calculatedWeight !== null) {
    patches.packageWeight = calculatedWeight
    stats.packageWeightFixed++
    changesMade = true
  }

  const calculatedDimensions = calculatePackageDimensions(doc.cart, doc.packageDimensions)
  if (calculatedDimensions !== null) {
    patches.packageDimensions = calculatedDimensions
    stats.packageDimensionsFixed++
    changesMade = true
  }

  if (changesMade && Object.keys(patches).length > 0) {
    if (!dryRun) {
      try {
        await sanity.patch(doc._id).set(patches).commit()
        stats.fixed++
        console.log(`✓ Fixed ${doc.orderNumber || doc._id}:`, Object.keys(patches).join(', '))
      } catch (err: any) {
        stats.errors.push({
          orderId: doc._id,
          orderNumber: doc.orderNumber,
          error: err.message,
        })
        console.error(`Failed to patch ${doc._id}: ${err.message}`)
      }
    } else {
      stats.fixed++
      console.log(`[DRY RUN] Would fix ${doc.orderNumber || doc._id}:`, Object.keys(patches).join(', '))
    }
  } else {
    stats.skipped++
  }
}

// ============================================================================
// CORS HELPER
// ============================================================================

function makeCORS(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const handler: Handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS, body: ''}
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  const dryRun = (event.queryStringParameters?.dryRun || '').toLowerCase() === 'true'
  const pageSize = Math.min(Number(event.queryStringParameters?.limit) || 77, 500)
  let offset = Math.max(Number(event.queryStringParameters?.offset) || 0, 0)

  const stats: BackfillStats = {
    total: 0,
    fixed: 0,
    skipped: 0,
    cardDetailsFixed: 0,
    shippingAddressFixed: 0,
    billingAddressFixed: 0,
    packageWeightFixed: 0,
    packageDimensionsFixed: 0,
    errors: [],
  }

  const startTime = Date.now()

  try {
    console.log(
      `Starting backfill: dryRun=${dryRun}, pageSize=${pageSize}, startingOffset=${offset}`,
    )

    let batchIndex = 0
    while (true) {
      const orders = await sanity.fetch(
        `
        *[_type == "order"][${offset}...${offset + pageSize}] | order(_createdAt desc) {
          _id,
          orderNumber,
          cardBrand,
          cardLast4,
          shippingAddress,
          billingAddress,
          packageWeight,
          packageDimensions,
          stripeSummary,
          customerName,
          customerEmail,
          cart
        }
      `,
      )

      if (!orders.length) {
        if (batchIndex === 0) {
          console.log('No orders found for the requested range.')
        }
        break
      }

      console.log(
        `Processing batch ${batchIndex + 1} (offset ${offset}-${offset + orders.length - 1}) with ${orders.length} orders...`,
      )

      for (const order of orders) {
        stats.total++
        await backfillOrder(order, stats, dryRun)
      }

      batchIndex += 1
      offset += pageSize
      if (orders.length < pageSize) {
        break
      }
    }

    const duration = Date.now() - startTime

    const summary = {
      success: true,
      dryRun,
      stats: {
        total: stats.total,
        fixed: stats.fixed,
        skipped: stats.skipped,
        breakdown: {
          cardDetails: stats.cardDetailsFixed,
          shippingAddress: stats.shippingAddressFixed,
          billingAddress: stats.billingAddressFixed,
          packageWeight: stats.packageWeightFixed,
          packageDimensions: stats.packageDimensionsFixed,
        },
        errors: stats.errors.length,
      },
      duration: `${duration}ms`,
      message: dryRun
        ? `Dry run complete. Would fix ${stats.fixed} of ${stats.total} orders.`
        : `Backfill complete. Fixed ${stats.fixed} of ${stats.total} orders.`,
    }

    if (stats.errors.length > 0) {
      console.error('Errors encountered:', stats.errors)
    }

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify(summary, null, 2),
    }
  } catch (err: any) {
    console.error('Backfill failed:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify(
        {
          success: false,
          error: err.message,
          stack: err.stack,
          stats,
        },
        null,
        2,
      ),
    }
  }
}

export default handler
