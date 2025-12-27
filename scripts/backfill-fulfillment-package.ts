#!/usr/bin/env tsx
/**
 * Backfill fulfillment.packageDimensions and fulfillment.shippingAddress
 * from stripeSummary metadata + legacy fields.
 *
 * - Weight is extracted from stripeSummary.metadata keys:
 *   shipping_total_weight_lbs | shipping_chargeable_lbs | shipping_weight
 * - Shipping address copies from stripeSummary.shippingAddress if missing.
 * - If legacy fulfillment.dimensions exists, copy length/width/height.
 * - Builds weightDisplay and dimensionsDisplay for UI.
 */

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {parseStripeSummaryData} from '../netlify/lib/stripeSummary'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

const client = createClient({
  projectId:
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset:
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    process.env.NEXT_PUBLIC_SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN,
  apiVersion: '2024-04-10',
  useCdn: false,
})

type OrderDoc = {
  _id: string
  orderNumber?: string
  stripeSummary?: {data?: string | null} | Record<string, any> | null
  shippingAddress?: Record<string, any> | null
  packageDimensions?: Record<string, any> | null
  dimensions?: {length?: number; width?: number; height?: number} | null
}

const WEIGHT_KEYS = [
  'shipping_total_weight_lbs',
  'shipping_chargeable_lbs',
  'shipping_weight_lbs',
  'shipping_weight',
]

function parseWeight(metadata?: Array<{key?: string; value?: string; source?: string}>): number | undefined {
  if (!Array.isArray(metadata)) return undefined
  for (const entry of metadata) {
    const key = (entry?.key || '').toString().trim().toLowerCase()
    if (!key) continue
    if (WEIGHT_KEYS.includes(key)) {
      const parsed = Number.parseFloat((entry?.value || '').toString())
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function buildDisplays(input: {
  weight?: number
  length?: number
  width?: number
  height?: number
}): {weightDisplay?: string; dimensionsDisplay?: string} {
  const weightDisplay =
    typeof input.weight === 'number' && Number.isFinite(input.weight)
      ? `${Number(input.weight.toFixed(2))} lb`
      : undefined
  const parts: string[] = []
  if (typeof input.length === 'number' && Number.isFinite(input.length)) {
    parts.push(Number(input.length.toFixed(2)).toString())
  }
  if (typeof input.width === 'number' && Number.isFinite(input.width)) {
    parts.push(Number(input.width.toFixed(2)).toString())
  }
  if (typeof input.height === 'number' && Number.isFinite(input.height)) {
    parts.push(Number(input.height.toFixed(2)).toString())
  }
  const dimensionsDisplay = parts.length ? `${parts.join(' x ')} in` : undefined
  return {weightDisplay, dimensionsDisplay}
}

async function main() {
  if (!client.config().token) {
    throw new Error('Missing SANITY_API_TOKEN / SANITY_WRITE_TOKEN for backfill.')
  }

  const orders = await client.fetch<OrderDoc[]>(
    `*[
      _type == "order" &&
      defined(stripeSummary.data) &&
      (
        !defined(packageDimensions.weight) ||
        !defined(packageDimensions.weightDisplay)
      )
    ]{
      _id,
      orderNumber,
      stripeSummary,
      shippingAddress,
      packageDimensions,
      dimensions
    }`,
  )

  if (!orders.length) {
    console.log('No orders require backfill.')
    return
  }

  console.log(`Backfilling ${orders.length} order(s)...`)
  let updated = 0
  let skipped = 0

  for (const order of orders) {
    const stripeSummary = parseStripeSummaryData(order.stripeSummary)
    const weight = parseWeight(stripeSummary?.metadata)
    const hasWeight = Boolean(order.packageDimensions?.weight)
    const legacyDims = order.dimensions || {}
    const pkg = order.packageDimensions || {}

    const length = pkg.length ?? legacyDims.length
    const width = pkg.width ?? legacyDims.width
    const height = pkg.height ?? legacyDims.height

    const shippingAddress = order.shippingAddress || stripeSummary?.shippingAddress

    if (hasWeight && shippingAddress) {
      skipped += 1
      continue
    }

    const display = buildDisplays({weight: weight ?? pkg.weight, length, width, height})

    const setOps: Record<string, any> = {}
    if (!hasWeight && weight !== undefined) {
      setOps['packageDimensions'] = {
        ...pkg,
        length,
        width,
        height,
        weight,
        weightUnit: pkg.weightUnit || 'lb',
        dimensionUnit: pkg.dimensionUnit || 'in',
        ...(display.weightDisplay ? {weightDisplay: display.weightDisplay} : {}),
        ...(display.dimensionsDisplay ? {dimensionsDisplay: display.dimensionsDisplay} : {}),
      }
    } else if (display.weightDisplay || display.dimensionsDisplay) {
      setOps['packageDimensions'] = {
        ...pkg,
        ...(display.weightDisplay ? {weightDisplay: display.weightDisplay} : {}),
        ...(display.dimensionsDisplay ? {dimensionsDisplay: display.dimensionsDisplay} : {}),
      }
    }

    if (shippingAddress && !order.shippingAddress) {
      setOps.shippingAddress = shippingAddress
    }

    if (Object.keys(setOps).length === 0) {
      skipped += 1
      continue
    }

    await client.patch(order._id).set(setOps).commit({autoGenerateArrayKeys: true})
    updated += 1
    console.log(
      `Updated ${order.orderNumber || order._id} • weight=${setOps['packageDimensions']?.weight ?? pkg.weight ?? 'n/a'}`,
    )
  }

  console.log(`Done. updated=${updated}, skipped=${skipped}, total=${orders.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
