import 'dotenv/config'
import {createClient} from '@sanity/client'

const PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  process.env.SANITY_PROJECT ||
  ''
const DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || process.env.SANITY_DB || ''
const TOKEN =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_STUDIO_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  ''

if (!PROJECT_ID || !DATASET || !TOKEN) {
  console.error(
    '[backfill-order-numbers] Missing Sanity credentials. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET and SANITY_API_TOKEN (or their equivalents).',
  )
  process.exit(1)
}

const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: '2024-10-01',
  token: TOKEN,
  useCdn: false,
})

const ORDER_PREFIX = 'FAS'

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function backfill(): Promise<void> {
  const docs = await client.fetch<
    Array<{_id: string; _type: string; orderNumber?: string; invoiceNumber?: string}>
  >(
    `*[_type in ["order", "invoice"] && (defined(orderNumber) || defined(invoiceNumber))]{
      _id,
      _type,
      orderNumber,
      invoiceNumber
    }`,
  )

  const patches = docs
    .map((doc) => {
      const nextOrderNumber = sanitizeOrderNumber(doc.orderNumber)
      const nextInvoiceNumber = sanitizeOrderNumber(doc.invoiceNumber)

      const setOps: Record<string, string> = {}
      if (nextOrderNumber && nextOrderNumber !== doc.orderNumber) setOps.orderNumber = nextOrderNumber
      if (nextInvoiceNumber && nextInvoiceNumber !== doc.invoiceNumber)
        setOps.invoiceNumber = nextInvoiceNumber

      if (Object.keys(setOps).length === 0) return null

      return {
        id: doc._id,
        set: setOps,
      }
    })
    .filter(Boolean) as Array<{id: string; set: Record<string, string>}>

  if (!patches.length) {
    console.log('[backfill-order-numbers] No documents required updates.')
    return
  }

  console.log(`[backfill-order-numbers] Updating ${patches.length} documents…`)

  const tx = client.transaction()
  for (const patch of patches) {
    tx.patch(patch.id, {set: patch.set})
  }

  await tx.commit({autoGenerateArrayKeys: true})
  console.log('[backfill-order-numbers] Done.')
}

backfill().catch((err) => {
  console.error('[backfill-order-numbers] Failed', err)
  process.exit(1)
})

