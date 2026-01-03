#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN
const schemaId = process.env.SANITY_SCHEMA_ID || process.env.SANITY_STUDIO_SCHEMA_ID

if (!projectId || !dataset || !token || !schemaId) {
  console.error(
    'Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, SANITY_WRITE_TOKEN, and SANITY_SCHEMA_ID.',
  )
  process.exit(1)
}

const resolvedProjectId = projectId as string
const resolvedDataset = dataset as string
const resolvedToken = token as string
const resolvedSchemaId = schemaId as string

const client = createClient({
  projectId: resolvedProjectId,
  dataset: resolvedDataset,
  apiVersion: '2024-04-10',
  token: resolvedToken,
  useCdn: false,
})

type CliOptions = {
  limit: number
}

function parseCliOptions(): CliOptions {
  const opts: CliOptions = {limit: 5}
  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.includes('=') ? raw.split('=') : [raw, undefined]
    switch (key) {
      case '--limit':
      case '--max':
        if (value === undefined) break
        {
          const parsed = Number(value)
          if (Number.isFinite(parsed) && parsed > 0) {
            opts.limit = Math.floor(parsed)
          }
        }
        break
      case '--help':
      case '-h':
        console.log('Usage: pnpm tsx scripts/agent-rewrite-product-titles-async.ts [--limit 5]')
        process.exit(0)
      default:
        break
    }
  }
  return opts
}

function formatAsyncResult(result: unknown): string {
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    const id = record._id || record.documentId || record.id
    if (typeof id === 'string') return id
    try {
      return JSON.stringify(result)
    } catch (err) {
      return String(err)
    }
  }
  return String(result)
}

async function run() {
  const {limit} = parseCliOptions()
  const ids: Array<{_id: string}> = await client.fetch(
    `*[_type == "product" && defined(title)][0...$limit]{_id}`,
    {limit},
  )

  if (!ids.length) {
    console.log('No products matched the query.')
    return
  }

  console.log(`Queueing async title rewrites for ${ids.length} product(s).`)

  for (const doc of ids) {
    const result = await client.agent.action.generate({
      schemaId: resolvedSchemaId,
      documentId: doc._id,
      instruction: 'Re-imagine the product title, $title, so that it is more engaging and interesting.',
      instructionParams: {
        title: {
          type: 'field',
          path: 'title',
        },
      },
      async: true,
      target: {path: 'title'},
    })

    console.log(`Queued AI rewrite for ${doc._id}: ${formatAsyncResult(result)}`)
  }
}

run().catch((err) => {
  console.error('Async product title rewrite failed', err)
  process.exit(1)
})
