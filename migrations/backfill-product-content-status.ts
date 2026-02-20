import 'dotenv/config'
import {getCliClient} from 'sanity/cli'

// USAGE:
// pnpm exec sanity exec migrations/backfill-product-content-status.ts --with-user-token

const API_VERSION = '2024-10-01'
const BATCH_SIZE = 100

const client = getCliClient({apiVersion: API_VERSION})

const normalizeContentStatus = (
  contentStatus: unknown,
  legacyStatus: unknown,
): 'draft' | 'review' | 'published' | null => {
  if (typeof contentStatus === 'string') {
    const normalized = contentStatus.toLowerCase().trim()
    if (normalized === 'draft' || normalized === 'review' || normalized === 'published') {
      return normalized
    }
  }

  if (typeof legacyStatus === 'string') {
    const normalized = legacyStatus.toLowerCase().trim()
    if (normalized === 'active' || normalized === 'live') return 'published'
    if (normalized === 'preview') return 'review'
    if (normalized === 'archived' || normalized === 'inactive') return 'draft'
  }

  return 'draft'
}

async function run() {
  const products: Array<{_id: string; contentStatus?: string; status?: string}> = await client.fetch(
    `*[_type == "product" && !defined(contentStatus)]{_id, contentStatus, status}`,
  )

  if (!products.length) {
    console.log('No products require contentStatus backfill.')
    return
  }

  console.log(`Backfilling contentStatus for ${products.length} products...`)

  let updated = 0
  let tx: ReturnType<typeof client.transaction> | null = null

  for (const product of products) {
    const resolved = normalizeContentStatus(product.contentStatus, product.status)
    if (!resolved) continue

    if (!tx) tx = client.transaction()
    tx.patch(product._id, {set: {contentStatus: resolved}})
    updated += 1

    if (updated % BATCH_SIZE === 0) {
      await tx.commit()
      tx = null
      console.log(`Committed ${updated}/${products.length}`)
    }
  }

  if (tx) {
    await tx.commit()
  }

  console.log(`Done. Updated ${updated} product documents.`)
}

run().catch((error) => {
  console.error('Failed to backfill product contentStatus:', error)
  process.exit(1)
})
