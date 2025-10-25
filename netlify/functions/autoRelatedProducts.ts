// netlify/functions/autoRelatedProducts.ts
import type { Handler } from '@netlify/functions'
import crypto from 'crypto'
import { createClient } from '@sanity/client'

/** ── ENV you need ─────────────────────────────────────────
 * SANITY_API_TOKEN         -> write token (update permission)
 * SANITY_STUDIO_PROJECT_ID -> e.g. r4og35qd
 * SANITY_STUDIO_DATASET    -> e.g. production
 * SANITY_WEBHOOK_SECRET    -> (same value you put into the webhook “Secret” box)
 */
const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || ''

const dataset =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

const token = process.env.SANITY_API_TOKEN || ''
const secret = process.env.SANITY_WEBHOOK_SECRET // optional but recommended

if (!projectId) {
  throw new Error(
    'autoRelatedProducts: Missing projectId (set SANITY_STUDIO_PROJECT_ID or SANITY_PROJECT_ID)',
  )
}

if (!token) {
  throw new Error('autoRelatedProducts: Missing SANITY_API_TOKEN with write access')
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

/** Verify webhook signature (from Sanity) */
function isValidSignature(rawBody: string, headerSig?: string) {
  if (!secret) return true
  if (!headerSig) return false
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(headerSig))
}

type ProductDoc = {
  _id: string
  _type: 'product'
  filtersArr?: string[]
  category?: { _ref: string }[] // references to category docs
}

const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    // Signature check (optional but good)
    const sigHeader = event.headers['x-sanity-signature'] || event.headers['X-Sanity-Signature']
    const rawBody = event.body || ''
    if (!isValidSignature(rawBody, String(sigHeader || ''))) {
      return { statusCode: 401, body: 'Invalid signature' }
    }

    const payload = JSON.parse(rawBody)
    // Support both the “minimal” and “full” payloads. Prefer documentId if present.
    const productId: string =
      payload?.documentId ||
      payload?.ids?.[0] ||
      payload?.transition?.id ||
      payload?.after?._id

    if (!productId) {
      return { statusCode: 200, body: 'No document id – nothing to do' }
    }

    // Ignore drafts
    const id = productId.startsWith('drafts.') ? productId.replace('drafts.', '') : productId

    // Fetch the source product
    const product: ProductDoc | null = await client.fetch(
      `*[_type=="product" && _id==$id][0]{
        _id,
        // Support both legacy string tags and new filterTag references
        "filtersArr": coalesce(filters[]->slug.current, filters),
        category[]{_ref}
      }`,
      { id },
    )

    if (!product) return { statusCode: 200, body: 'Product not found (possibly deleted)' }

    const sourceFilterSet = new Set<string>((product.filtersArr || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))
    const sourceCategoryIds = new Set<string>((product.category || []).map((c) => c._ref))

    // If there are no signals, clear related and exit
    if (sourceFilterSet.size === 0 && sourceCategoryIds.size === 0) {
      await client
        .patch(id)
        .set({ relatedProducts: [] })
        .commit({ autoGenerateArrayKeys: true })
      return { statusCode: 200, body: 'Cleared relatedProducts (no filters/categories)' }
    }

    // Fetch candidate products (exclude self)
    const candidates: ProductDoc[] = await client.fetch(
      `*[_type=="product" && _id!=$id]{
        _id,
        "filtersArr": coalesce(filters[]->slug.current, filters),
        "category": coalesce(category, [])
      }`,
      { id },
    )

    // Score candidates
    const scored = candidates
      .map((p) => {
        const theirFilters = new Set<string>((p.filtersArr || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))
        const theirCats = new Set<string>((p.category || []).map((c: any) => c?._ref).filter(Boolean))

        let score = 0
        // Category overlap counts more
        for (const c of theirCats) if (sourceCategoryIds.has(c)) score += 3
        // Filter/tag overlap
        for (const f of theirFilters) if (sourceFilterSet.has(f)) score += 1

        return { _id: p._id, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8) // keep top N

    const refs = scored.map((x) => ({ _type: 'reference', _ref: x._id }))

    await client
      .patch(id)
      .set({ relatedProducts: refs })
      .commit({ autoGenerateArrayKeys: true })

    return {
      statusCode: 200,
      body: JSON.stringify({ updated: id, count: refs.length }),
    }
  } catch (err: any) {
    console.error('autoRelatedProducts failed', err)
    return { statusCode: 500, body: `autoRelatedProducts error: ${err?.message || err}` }
  }
}

export { handler }
