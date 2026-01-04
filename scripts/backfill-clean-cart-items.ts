#!/usr/bin/env tsx

/**
 * Backfill clean cart item fields on existing orders.
 * - Links productRef via Stripe price/product/SKU/title/slug
 * - Overwrites SKU with Sanity SKU when found
 * - Derives selectedVariant/addOns from optionDetails/upgrades
 * - Recomputes quantity/price/line totals and upgradesTotal when missing
 * - Ensures _type/_key set on cart items
 *
 * Usage: pnpm tsx scripts/backfill-clean-cart-items.ts [--limit N] [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {randomUUID} from 'node:crypto'
import type {CartItem, CartProductSummary} from '../netlify/lib/cartEnrichment'
import {
  fetchProductsForCart,
  findProductForItem,
} from '../netlify/lib/cartEnrichment'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || ''
const dataset =
  process.env.SANITY_STUDIO_DATASET || 'production'
const token =
  process.env.SANITY_API_TOKEN || ''

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity credentials: SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2024-10-01',
  useCdn: false,
})

type CliOptions = {limit?: number; dryRun: boolean}

function parseArgs(argv: string[]): CliOptions {
  let limit: number | undefined
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '--dryRun') dryRun = true
    if (arg === '--limit') {
      const val = argv[i + 1]
      if (!val || val.startsWith('--')) throw new Error('Missing value for --limit')
      const parsed = Number(val)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit ${val}`)
      limit = Math.floor(parsed)
      i++
    }
  }
  return {limit, dryRun}
}

const {limit, dryRun} = parseArgs(process.argv.slice(2))

const upgradePrefix = /^Upgrade:\s*/i

function deriveSelectedVariant(optionDetails?: unknown[]): string | undefined {
  if (!Array.isArray(optionDetails)) return undefined
  const first = optionDetails.find(
    (opt) => typeof opt === 'string' && !opt.toLowerCase().includes('upgrade'),
  )
  if (typeof first === 'string') {
    const parts = first.split(':')
    return (parts.length > 1 ? parts[parts.length - 1] : first).trim() || undefined
  }
  return undefined
}

function normalizeAddOnLabel(value: string): string | undefined {
  if (!value) return undefined
  let label = value.trim()
  if (!label) return undefined
  if (/:/.test(label)) {
    const parts = label.split(':').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 1) {
      label = parts[parts.length - 1]
    }
  }
  label = label.replace(/^option\s*\d*\s*:?\s*/i, '').trim()
  label = label.replace(/^(upgrade|add[-\s]?on)s?\s*:?\s*/i, '').trim()
  return label || undefined
}

function deriveAddOns(item: CartItem): string[] | undefined {
  const raw = Array.isArray(item.addOns) ? item.addOns : []
  const upgrades = Array.isArray(item.upgrades) ? item.upgrades : []
  const optionUpgradeEntries = Array.isArray(item.optionDetails)
    ? item.optionDetails.filter(
        (opt) => typeof opt === 'string' && opt.toLowerCase().includes('upgrade'),
      )
    : []
  const combined = [...raw, ...upgrades, ...optionUpgradeEntries]
  const cleaned = combined
    .map((u) =>
      typeof u === 'string'
        ? normalizeAddOnLabel(u.replace(upgradePrefix, '').trim()) || undefined
        : undefined,
    )
    .filter((v): v is string => Boolean(v))
  return cleaned.length ? Array.from(new Set(cleaned)) : undefined
}

function cleanCartItem(item: CartItem, products: CartProductSummary[]): CartItem {
  const next: CartItem = {...item}
  if (next._type !== 'orderCartItem') next._type = 'orderCartItem'
  if (typeof next._key !== 'string' || !next._key) next._key = randomUUID()

  const product = findProductForItem(next, products)
  if (product?._id) {
    next.productRef = {_type: 'reference', _ref: product._id}
    if (!next.productSlug && product.slug?.current) {
      next.productSlug = product.slug.current
    }
  }
  if (product?.sku) {
    next.sku = product.sku
  }

  // Pricing
  const quantity =
    typeof next.quantity === 'number' && Number.isFinite(next.quantity) && next.quantity > 0
      ? Math.round(next.quantity)
      : 1
  next.quantity = quantity
  const unitPrice =
    typeof next.price === 'number' && Number.isFinite(next.price) ? next.price : undefined
  const fallbackUnit =
    unitPrice !== undefined
      ? unitPrice
      : typeof next.total === 'number' && Number.isFinite(next.total)
        ? Number(next.total) / quantity
        : typeof next.lineTotal === 'number' && Number.isFinite(next.lineTotal)
          ? Number(next.lineTotal) / quantity
          : 0

  next.price = unitPrice ?? fallbackUnit

  const upgradesTotalExisting =
    typeof next.upgradesTotal === 'number' && Number.isFinite(next.upgradesTotal)
      ? next.upgradesTotal
      : undefined
  const lineTotalCandidate =
    typeof next.total === 'number' && Number.isFinite(next.total)
      ? Number(next.total)
      : typeof next.lineTotal === 'number' && Number.isFinite(next.lineTotal)
        ? Number(next.lineTotal)
        : undefined
  const computedLine = next.price ? next.price * quantity : 0
  const resolvedLine = lineTotalCandidate ?? computedLine
  const derivedUpgrades =
    upgradesTotalExisting !== undefined
      ? upgradesTotalExisting
      : Math.max(0, resolvedLine - computedLine)

  next.upgradesTotal = derivedUpgrades || undefined
  next.lineTotal = resolvedLine || computedLine + (derivedUpgrades || 0)
  next.total = next.lineTotal

  // Selections
  next.selectedVariant = next.selectedVariant || deriveSelectedVariant(next.optionDetails)
  const addOns = deriveAddOns(next)
  if (addOns?.length) next.addOns = addOns

  return next
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet()
  const helper = (val: any): any => {
    if (val && typeof val === 'object') {
      if (seen.has(val)) return null
      seen.add(val)
      if (Array.isArray(val)) return val.map(helper)
      return Object.keys(val)
        .sort()
        .reduce<Record<string, any>>((acc, key) => {
          acc[key] = helper(val[key])
          return acc
        }, {})
    }
    return val
  }
  return JSON.stringify(helper(value))
}

async function main() {
  let updated = 0
  let inspected = 0
  const pageSize = 50
  let cursor = ''

  while (true) {
    if (limit && inspected >= limit) break
    const remaining = limit ? Math.max(0, limit - inspected) : pageSize
    const take = limit ? Math.min(pageSize, remaining) : pageSize

    const docs = await client.fetch<{_id: string; cart: CartItem[]}[]>(
      `*[_type == "order" && _id > $cursor && defined(cart) && count(cart) > 0] | order(_id) [0...$limit]{
        _id,
        cart
      }`,
      {cursor, limit: take},
    )

    if (!docs.length) break

    for (const doc of docs) {
      inspected++
      cursor = doc._id
      const cart = Array.isArray(doc.cart) ? doc.cart : []
      if (!cart.length) continue
      const products = await fetchProductsForCart(cart, client)
      const cleaned = cart.map((item) => cleanCartItem(item, products))
      const changed = stableStringify(cleaned) !== stableStringify(cart)
      if (changed) {
        updated++
        if (!dryRun) {
          await client.patch(doc._id).set({cart: cleaned}).commit({autoGenerateArrayKeys: true})
        }
      }
      if (limit && inspected >= limit) break
    }

    if (docs.length < take) break
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        inspected,
        updated,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
