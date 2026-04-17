import fs from 'node:fs'
import path from 'node:path'
import {config as loadDotenv} from 'dotenv'
import {createClient} from '@sanity/client'

type RedirectRow = {
  oldSlug: string
  newSlug: string
}

const PROJECT_ROOT = process.cwd()
const REDIRECTS_PATH = path.join(PROJECT_ROOT, 'redirects.json')

const loadEnvFiles = () => {
  const candidates = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
  ].map((filename) => path.join(PROJECT_ROOT, filename))

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      loadDotenv({path: file, override: false})
    }
  }
}

const normalizePath = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const stableIdForFrom = (from: string) => `redirect.${Buffer.from(from).toString('base64url')}`

async function run() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run') || args.has('-n')

  if (!fs.existsSync(REDIRECTS_PATH)) {
    console.error(`Missing redirects file: ${REDIRECTS_PATH}`)
    process.exit(1)
  }

  const rows = JSON.parse(fs.readFileSync(REDIRECTS_PATH, 'utf8')) as RedirectRow[]
  if (!Array.isArray(rows)) {
    console.error('redirects.json must be an array of { oldSlug, newSlug } entries')
    process.exit(1)
  }

  loadEnvFiles()

  const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
  const token =
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_AUTH_TOKEN ||
    process.env.SANITY_STUDIO_API_TOKEN ||
    process.env.SANITY_WRITE_TOKEN

  if (!projectId || !dataset || !token) {
    console.error(
      'Missing Sanity config. Set SANITY_STUDIO_PROJECT_ID/SANITY_PROJECT_ID, SANITY_STUDIO_DATASET/SANITY_DATASET, and SANITY_API_TOKEN.',
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

  const existing = await client.fetch<Array<{_id: string; from?: string}>>(
    '*[_type == "redirect" && !(_id in path("drafts.**"))]{_id, from}',
  )
  const existingByFrom = new Map<string, string>()
  for (const doc of existing) {
    if (doc.from) existingByFrom.set(doc.from, doc._id)
  }

  const normalizedRows = rows
    .map((row) => ({
      from: normalizePath(row.oldSlug),
      to: normalizePath(row.newSlug),
    }))
    .filter((row) => row.from.length > 0 && row.to.length > 0)

  const deduped = Array.from(new Map(normalizedRows.map((row) => [row.from, row])).values())

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Preparing ${deduped.length} redirect documents in dataset ${dataset}`,
  )

  if (dryRun) {
    for (const row of deduped) {
      const existingId = existingByFrom.get(row.from)
      const targetId = existingId || stableIdForFrom(row.from)
      console.log(`- ${row.from} -> ${row.to} (${existingId ? 'update' : 'create'} ${targetId})`)
    }
    return
  }

  for (const row of deduped) {
    const targetId = existingByFrom.get(row.from) || stableIdForFrom(row.from)

    await client.createOrReplace({
      _id: targetId,
      _type: 'redirect',
      from: row.from,
      to: row.to,
      statusCode: 301,
      active: true,
      notes: 'Legacy URL migration redirect (April 2026)',
    })

    console.log(`Upserted: ${row.from} -> ${row.to}`)
  }

  console.log('Redirect seeding complete.')
}

void run().catch((error) => {
  console.error('Failed to seed redirects:', error)
  process.exit(1)
})
