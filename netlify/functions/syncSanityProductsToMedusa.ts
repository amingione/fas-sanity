/**
 * syncSanityProductsToMedusa — Netlify Function
 *
 * Queries Sanity for products with contentStatus == "published" (or status ==
 * "active") that do NOT yet have a medusaProductId, then fires the Medusa
 * sanity-product-sync webhook for each one.
 *
 * Intended for:
 *   1. One-time backfill of existing Sanity products that pre-date the
 *      Medusa migration (no medusaProductId set).
 *   2. On-demand re-sync triggered from fas-dash admin or Sanity Studio.
 *
 * Usage:
 *   POST /.netlify/functions/syncSanityProductsToMedusa
 *   Body (optional): { "dryRun": true, "limit": 50, "ids": ["sanity-id-1", ...] }
 *
 * Required env vars:
 *   SANITY_STUDIO_PROJECT_ID  (or SANITY_PROJECT_ID)
 *   SANITY_STUDIO_DATASET     (or SANITY_DATASET)
 *   SANITY_API_TOKEN
 *   MEDUSA_API_URL            — e.g. https://api.fasmotorsports.com
 *   WEBHOOK_FORWARD_SHARED_SECRET (optional, forwarded as x-fas-forwarded-secret)
 *   SYNC_BACKFILL_SECRET      — required to authorise calls to this function
 */

import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

// ── Env helpers ───────────────────────────────────────────────────────────────

const readEnv = (name: string): string => {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

const requireEnv = (name: string): string => {
  const v = readEnv(name)
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

// ── Sanity client ─────────────────────────────────────────────────────────────

function buildSanityClient() {
  const projectId =
    readEnv('SANITY_STUDIO_PROJECT_ID') || requireEnv('SANITY_PROJECT_ID')
  const dataset =
    readEnv('SANITY_STUDIO_DATASET') || requireEnv('SANITY_DATASET')
  const token = requireEnv('SANITY_API_TOKEN')
  return createClient({ projectId, dataset, token, apiVersion: '2024-04-10', useCdn: false })
}

// ── GROQ query ────────────────────────────────────────────────────────────────

const UNSYNCED_PRODUCTS_QUERY = /* groq */ `
  *[
    _type == "product"
    && !(_id in path("drafts.**"))
    && (contentStatus == "published" || status == "active")
    && !defined(medusaProductId)
  ] | order(_createdAt asc) [0...$limit] {
    _id,
    title,
    slug { current },
    contentStatus,
    status,
    medusaProductId
  }
`

const PRODUCT_BY_ID_QUERY = /* groq */ `
  *[_type == "product" && _id in $ids && !(_id in path("drafts.**"))] {
    _id,
    title,
    slug { current },
    contentStatus,
    status,
    medusaProductId
  }
`

// ── Medusa webhook call ───────────────────────────────────────────────────────

interface SyncResult {
  sanityId: string
  title: string
  status: 'ok' | 'skipped' | 'error'
  error?: string
  medusaStatus?: number
}

async function triggerMedusaSync(
  sanityId: string,
  medusaBase: string,
  sharedSecret: string,
  dryRun: boolean,
): Promise<SyncResult> {
  const placeholder = { _id: sanityId, _type: 'product', documentId: sanityId }

  if (dryRun) {
    return { sanityId, title: sanityId, status: 'ok' }
  }

  const url = `${medusaBase.replace(/\/+$/, '')}/webhooks/sanity-product-sync`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sharedSecret ? { 'x-fas-forwarded-secret': sharedSecret } : {}),
        'x-fas-backfill': 'true',
      },
      body: JSON.stringify(placeholder),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    if (res.ok) {
      return { sanityId, title: sanityId, status: 'ok', medusaStatus: res.status }
    }
    return {
      sanityId,
      title: sanityId,
      status: 'error',
      error: `Medusa responded ${res.status}: ${text.slice(0, 200)}`,
      medusaStatus: res.status,
    }
  } catch (err) {
    return {
      sanityId,
      title: sanityId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  const origin = event.headers['origin'] || ''
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-backfill-secret',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  // Auth guard — require SYNC_BACKFILL_SECRET if configured
  const backfillSecret = readEnv('SYNC_BACKFILL_SECRET')
  if (backfillSecret) {
    const provided =
      event.headers['x-backfill-secret'] ||
      event.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      ''
    if (provided !== backfillSecret) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      }
    }
  }

  let body: Record<string, any> = {}
  try {
    if (event.body) body = JSON.parse(event.body)
  } catch {
    // Ignore parse errors; use defaults
  }

  const dryRun = body.dryRun === true
  const limit: number = typeof body.limit === 'number' ? Math.min(body.limit, 200) : 50
  const specificIds: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []

  let medusaBase: string
  let sharedSecret: string
  try {
    medusaBase = requireEnv('MEDUSA_API_URL')
    sharedSecret = readEnv('WEBHOOK_FORWARD_SHARED_SECRET')
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: (err as Error).message }),
    }
  }

  let sanity: ReturnType<typeof createClient>
  try {
    sanity = buildSanityClient()
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: (err as Error).message }),
    }
  }

  // Fetch products from Sanity
  let products: Array<{ _id: string; title?: string; slug?: { current?: string }; medusaProductId?: string }>
  try {
    if (specificIds.length > 0) {
      products = await sanity.fetch(PRODUCT_BY_ID_QUERY, { ids: specificIds })
    } else {
      products = await sanity.fetch(UNSYNCED_PRODUCTS_QUERY, { limit })
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Sanity query failed: ${(err as Error).message}` }),
    }
  }

  console.info(`[syncSanityProductsToMedusa] Found ${products.length} product(s) to sync`, {
    dryRun,
    limit,
    specificIds: specificIds.length > 0 ? specificIds : undefined,
  })

  const results: SyncResult[] = []
  let ok = 0
  let skipped = 0
  let errors = 0

  for (const product of products) {
    // Skip products that already have a medusaProductId (unless specifically requested)
    if (product.medusaProductId && specificIds.length === 0) {
      results.push({ sanityId: product._id, title: product.title || product._id, status: 'skipped' })
      skipped++
      continue
    }

    const result = await triggerMedusaSync(product._id, medusaBase, sharedSecret, dryRun)
    result.title = product.title || result.title
    results.push(result)

    if (result.status === 'ok') ok++
    else if (result.status === 'error') errors++

    // Small delay to avoid hammering Medusa
    if (!dryRun && products.length > 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      dryRun,
      total: products.length,
      ok,
      skipped,
      errors,
      results,
    }),
  }
}
