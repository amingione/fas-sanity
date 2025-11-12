#!/usr/bin/env tsx
import {createClient} from '@sanity/client'

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN.')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

type CartItem = {
  _key?: string
  optionSummary?: string | null
  upgrades?: unknown
  metadata?: any
  metadataEntries?: any
}

type OrderDoc = {
  _id: string
  cart?: CartItem[] | null
}

function sanitizeUpgrades(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => Boolean(entry))
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

function buildMetadataObject(item: CartItem): Record<string, unknown> | undefined {
  const summary = typeof item.optionSummary === 'string' ? item.optionSummary.trim() : ''
  const upgrades = sanitizeUpgrades(item.upgrades)
  if (!summary && (!upgrades || upgrades.length === 0)) return undefined
  return {
    option_summary: summary || undefined,
    upgrades,
  }
}

function resolveMetadataEntries(item: CartItem): any[] | undefined {
  if (Array.isArray(item.metadataEntries)) return item.metadataEntries
  if (Array.isArray(item.metadata)) return item.metadata
  return undefined
}

async function backfillOrderCartMetadata(batchSize = 20) {
  let processed = 0

  while (true) {
    const orders: OrderDoc[] = await client.fetch(
      `*[_type == "order" && count(cart[defined(metadata) && !defined(metadata.option_summary) || defined(optionSummary) || defined(upgrades)]) > 0][0...$limit]{
        _id,
        cart[]{
          _key,
          optionSummary,
          upgrades,
          metadata,
          metadataEntries
        }
      }`,
      {limit: batchSize},
    )

    if (!orders.length) break

    for (const order of orders) {
      if (!Array.isArray(order.cart) || order.cart.length === 0) continue

      const setOps: Record<string, unknown> = {}
      const unsetOps: string[] = []

      for (const item of order.cart) {
        if (!item || typeof item !== 'object' || !item._key) continue
        const key = item._key
        const entries = resolveMetadataEntries(item)
        const metadataObject = buildMetadataObject(item)

        if (entries && entries.length) {
          setOps[`cart[_key == "${key}"].metadataEntries`] = entries
        } else {
          unsetOps.push(`cart[_key == "${key}"].metadataEntries`)
        }

        if (metadataObject) {
          setOps[`cart[_key == "${key}"].metadata`] = metadataObject
        } else {
          unsetOps.push(`cart[_key == "${key}"].metadata`)
        }
      }

      if (Object.keys(setOps).length === 0 && unsetOps.length === 0) continue

      let patch = client.patch(order._id)
      if (Object.keys(setOps).length) {
        patch = patch.set(setOps)
      }
      if (unsetOps.length) {
        patch = patch.unset(unsetOps)
      }

      await patch.commit({autoGenerateArrayKeys: true})
      processed += 1
      console.log(`Updated order ${order._id}`)
    }
  }

  console.log(`Backfill complete. Updated ${processed} order${processed === 1 ? '' : 's'}.`)
}

backfillOrderCartMetadata().catch((err) => {
  console.error('Failed to backfill order cart metadata', err)
  process.exit(1)
})

