#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

type CliOptions = {
  batchSize: number
  maxDocs?: number
  dryRun: boolean
}

type NormalizedShippingConfig = {
  weight: number | null
  dimensions: {length: number; width: number; height: number} | null
  shippingClass: string
  handlingTime: number
  requiresShipping: boolean
  freeShippingEligible: boolean
  separateShipment: boolean
  callForShippingQuote: boolean
}

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeShippingClass = (value?: string | null) => {
  if (!value) return undefined
  const normalized = value.toString().toLowerCase().replace(/\s+/g, '_')
  return normalized || undefined
}

const parseDimensions = (value?: string | null) => {
  if (!value || typeof value !== 'string') return undefined
  const match = value.match(
    /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/,
  )
  if (!match) return undefined
  const [, l, w, h] = match
  const length = Number.parseFloat(l)
  const width = Number.parseFloat(w)
  const height = Number.parseFloat(h)
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined
  }
  return {length, width, height}
}

function parseCliOptions(): CliOptions {
  const opts: CliOptions = {batchSize: 50, dryRun: false}
  for (const raw of process.argv.slice(2)) {
    const [key, value = 'true'] = raw.includes('=') ? raw.split('=') : [raw, undefined]
    switch (key) {
      case '--batch':
      case '--batchSize':
        if (value !== undefined) {
          const parsed = Number(value)
          if (Number.isFinite(parsed) && parsed > 0) {
            opts.batchSize = Math.floor(parsed)
          }
        }
        break
      case '--max':
      case '--limit':
        if (value !== undefined) {
          const parsed = Number(value)
          if (Number.isFinite(parsed) && parsed > 0) {
            opts.maxDocs = Math.floor(parsed)
          }
        }
        break
      case '--dry-run':
      case '--dry':
        opts.dryRun = true
        break
      case '--help':
      case '-h':
        console.log(
          'Usage: pnpm tsx scripts/migrateProductShipping.ts [--batch 50] [--max 500] [--dry-run]',
        )
        process.exit(0)
      default:
        break
    }
  }
  return opts
}

function variantIds(id: string): string[] {
  const baseId = id.startsWith('drafts.') ? id.slice(7) : id
  return Array.from(new Set([baseId, `drafts.${baseId}`]))
}

async function patchShippingConfig(docId: string, shippingConfig: NormalizedShippingConfig) {
  let patched = 0
  for (const targetId of variantIds(docId)) {
    try {
      await client
        .patch(targetId)
        .set({shippingConfig})
        .commit({autoGenerateArrayKeys: true})
      patched += 1
    } catch (err: any) {
      if (err?.response?.statusCode === 404) continue
      throw err
    }
  }
  if (patched === 0) {
    throw new Error(`No draft or published document found for ${docId}`)
  }
}

async function migrateProductShipping(batchSize: number, maxDocs?: number, dryRun = false) {
  let processed = 0
  console.log(
    `Starting shippingConfig migration (batch=${batchSize}, max=${maxDocs ?? '∞'}, dryRun=${
      dryRun ? 'yes' : 'no'
    })`,
  )

  while (true) {
    if (maxDocs && processed >= maxDocs) break
    const effectiveLimit = maxDocs ? Math.min(batchSize, maxDocs - processed) : batchSize
    if (effectiveLimit <= 0) break

    const products: Array<{
      _id: string
      productType?: string
      shippingWeight?: number | string | null
      boxDimensions?: string | null
      shippingClass?: string | null
      handlingTime?: number | string | null
      shipsAlone?: boolean | null
      shippingConfig?: {
        weight?: number | null
        dimensions?: {length?: number | null; width?: number | null; height?: number | null} | null
        shippingClass?: string | null
        handlingTime?: number | null
        requiresShipping?: boolean | null
        separateShipment?: boolean | null
        freeShippingEligible?: boolean | null
        callForShippingQuote?: boolean | null
      } | null
    }> = await client.fetch(
      `*[_type == "product" && (
        !defined(shippingConfig.requiresShipping) ||
        !defined(shippingConfig.weight) ||
        !defined(shippingConfig.dimensions) ||
        !defined(shippingConfig.shippingClass) ||
        !defined(shippingConfig.handlingTime) ||
        !defined(shippingConfig.freeShippingEligible) ||
        !defined(shippingConfig.separateShipment)
      )][0...$limit]{
        _id,
        productType,
        shippingWeight,
        boxDimensions,
        shippingClass,
        handlingTime,
        shipsAlone,
        shippingConfig{
          weight,
          dimensions{
            length,
            width,
            height
          },
          shippingClass,
          handlingTime,
          requiresShipping,
          separateShipment,
          freeShippingEligible,
          callForShippingQuote
        }
      }`,
      {limit: effectiveLimit},
    )

    if (!products.length) {
      console.log('No products requiring migration found. Exiting.')
      break
    }

    for (const product of products) {
      const existing = product.shippingConfig || {}
      const weight =
        existing.weight ?? parseNumber(product.shippingWeight) ?? null
      const dimensions =
        existing.dimensions && existing.dimensions.length && existing.dimensions.width && existing.dimensions.height
          ? existing.dimensions
          : parseDimensions(product.boxDimensions) || null
      const shippingClass =
        normalizeShippingClass(existing.shippingClass) ||
        normalizeShippingClass(product.shippingClass) ||
        'standard'
      const handlingTime =
        existing.handlingTime ?? parseNumber(product.handlingTime) ?? 2
      const requiresShipping =
        existing.requiresShipping !== undefined
          ? existing.requiresShipping
          : (product.productType || '').toLowerCase() === 'service'
            ? false
            : true
      const freeShippingEligible =
        existing.freeShippingEligible !== undefined ? existing.freeShippingEligible : true
      const separateShipment =
        existing.separateShipment !== undefined
          ? existing.separateShipment
          : product.shipsAlone ?? false
      const callForShippingQuote = existing.callForShippingQuote === true

      const shippingConfig: NormalizedShippingConfig = {
        weight,
        dimensions,
        shippingClass,
        handlingTime,
        requiresShipping,
        freeShippingEligible,
        separateShipment,
        callForShippingQuote,
      }

      if (dryRun) {
        console.log(`[dry-run] Would update ${product._id} with`, shippingConfig)
      } else {
        await patchShippingConfig(product._id, shippingConfig)
        console.log(`Updated ${product._id}`)
      }

      processed += 1
    }
  }

  console.log(`Migration complete. Processed ${processed} product${processed === 1 ? '' : 's'}.`)
}

const {batchSize, maxDocs, dryRun} = parseCliOptions()

migrateProductShipping(batchSize, maxDocs, dryRun).catch((err) => {
  console.error('Migration failed', err)
  process.exit(1)
})
