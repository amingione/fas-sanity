#!/usr/bin/env tsx
import 'dotenv/config'
import {createClient} from '@sanity/client'

type CliOptions = {
  dryRun: boolean
}

function parseCliOptions(): CliOptions {
  const opts: CliOptions = {dryRun: false}
  for (const raw of process.argv.slice(2)) {
    const key = raw.trim().toLowerCase()
    if (key === '--dry-run' || key === '--dryrun') {
      opts.dryRun = true
    } else if (key === '--help' || key === '-h') {
      console.log('Usage: pnpm tsx scripts/backfill-vendor-portal-enabled.ts [--dry-run]')
      process.exit(0)
    }
  }
  return opts
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

const opts = parseCliOptions()

async function run() {
  const candidates = await client.fetch<string[]>(
    `*[_type == "vendor" &&
      portalAccess.enabled == false &&
      (defined(portalAccess.setupCompletedAt) || defined(portalAccess.passwordHash))
    ][]._id`,
  )

  if (!candidates.length) {
    console.log('No vendor records require portalAccess.enabled backfill.')
    return
  }

  console.log(`Found ${candidates.length} vendor(s) to update.`)
  for (const id of candidates) {
    if (opts.dryRun) {
      console.log(`[dry-run] Would enable portal access for ${id}`)
      continue
    }
    await client.patch(id).set({'portalAccess.enabled': true}).commit()
    console.log(`Enabled portal access for ${id}`)
  }
}

run().catch((err) => {
  console.error('Backfill failed', err)
  process.exit(1)
})
