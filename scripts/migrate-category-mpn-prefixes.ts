#!/usr/bin/env tsx
import {createClient} from '@sanity/client'

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN.',
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

type CategoryDoc = {
  _id: string
  title?: string
  slug?: {current?: string}
  mpnPrefix?: string
}

const PREFIX_BY_NORMALIZED_LABEL = new Map<string, string>([
  ['hellcatplatform', 'HC'],
  ['hellcat', 'HC'],
  ['trx', 'TRX'],
  ['ramtrx', 'TRX'],
  ['trackhawk', 'THWK'],
  ['universalpart', 'UNI'],
  ['universal', 'UNI'],
  ['pulleys', 'PUL'],
  ['pulley', 'PUL'],
  ['snout', 'SNOUT'],
  ['superchargersnout', 'SNOUT'],
  ['snouts', 'SNOUT'],
  ['intake', 'INTK'],
  ['intakes', 'INTK'],
  ['package', 'PKG'],
  ['packages', 'PKG'],
  ['buildpackages', 'PKG'],
  ['electronics', 'ELEC'],
  ['electronicsensors', 'ELEC'],
  ['sensor', 'ELEC'],
  ['sensors', 'ELEC'],
  ['fuel', 'FUEL'],
  ['fuelsystem', 'FUEL'],
  ['cooling', 'COOL'],
  ['coolingcomponents', 'COOL'],
])

const DEFAULT_PREFIX = 'UNI'

const normalize = (value?: string) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

const resolvePrefix = (category: CategoryDoc) => {
  const slug = normalize(category.slug?.current)
  const title = normalize(category.title)

  return (
    (slug && PREFIX_BY_NORMALIZED_LABEL.get(slug)) ||
    (title && PREFIX_BY_NORMALIZED_LABEL.get(title)) ||
    DEFAULT_PREFIX
  )
}

async function migratePrefixes() {
  const dryRun = process.argv.includes('--dry-run')
  const categories = await client.fetch<CategoryDoc[]>(
    `*[_type == "category"]{_id, title, slug, mpnPrefix}`,
  )

  if (!categories.length) {
    console.log('No categories found.')
    return
  }

  console.log(`Found ${categories.length} categories.`)
  for (const category of categories) {
    const desiredPrefix = resolvePrefix(category)
    if (category.mpnPrefix === desiredPrefix) {
      continue
    }

    const label = category.title || category.slug?.current || category._id
    if (dryRun) {
      console.log(`[dry-run] Would set ${label} (${category._id}) -> ${desiredPrefix}`)
      continue
    }

    await client.patch(category._id).set({mpnPrefix: desiredPrefix}).commit()
    console.log(`Updated ${label} (${category._id}) -> ${desiredPrefix}`)
  }

  console.log('Migration complete.')
}

migratePrefixes().catch((error) => {
  console.error('Failed to migrate category prefixes', error)
  process.exit(1)
})
