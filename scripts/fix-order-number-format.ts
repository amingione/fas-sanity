#!/usr/bin/env tsx

import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config({path: path.join(process.cwd(), '.env.development.local')})
dotenv.config({path: path.join(process.cwd(), '.env.local')})

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd'
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const token =
  process.env.SANITY_AUTH_TOKEN || process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

if (!token) {
  console.error('Missing SANITY_AUTH_TOKEN / SANITY_API_TOKEN / SANITY_WRITE_TOKEN')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  token,
  useCdn: false,
  apiVersion: '2024-10-01',
})

const ORDER_NUMBER_PREFIX = 'FAS'

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function isUnique(candidate: string): Promise<boolean> {
  const exists = await client.fetch<number>(
    'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
    {num: candidate},
  )
  return !Number(exists)
}

async function pickUnique(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = sanitizeOrderNumber(candidate)
    if (!normalized) continue
    if (await isUnique(normalized)) return normalized
  }
  return null
}

async function main() {
  let cursor = ''
  let patched = 0
  let skipped = 0
  const start = Date.now()

  while (true) {
    const batch = await client.fetch<
      Array<{
        _id: string
        orderNumber?: string
        slug?: {current?: string} | string | null
        stripeSessionId?: string | null
      }>
    >(
      `*[_type == "order" && orderNumber != null && !(orderNumber match "FAS-[0-9]{6}") && _id > $cursor] | order(_id) [0...100]{
        _id,
        orderNumber,
        slug,
        stripeSessionId
      }`,
      {cursor},
    )

    if (!batch.length) break

    for (const doc of batch) {
      const slugCurrent =
        typeof doc.slug === 'string'
          ? doc.slug
          : typeof doc.slug?.current === 'string'
            ? doc.slug.current
            : undefined
      const candidate = await pickUnique([
        doc.orderNumber,
        slugCurrent,
        doc.stripeSessionId || undefined,
        doc._id,
      ])
      if (!candidate) {
        skipped++
        cursor = doc._id
        continue
      }
      if (candidate === doc.orderNumber) {
        skipped++
        cursor = doc._id
        continue
      }
      await client.patch(doc._id).set({orderNumber: candidate}).commit()
      console.log(`Updated ${doc._id}: ${doc.orderNumber} -> ${candidate}`)
      patched++
      cursor = doc._id
    }

    if (batch.length < 100) break
  }

  console.log(`Done. Patched: ${patched}, skipped: ${skipped}, time: ${Date.now() - start}ms`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
