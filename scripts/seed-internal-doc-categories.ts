import fs from 'node:fs'
import path from 'node:path'
import {config as loadDotenv} from 'dotenv'
import {createClient} from '@sanity/client'

const PROJECT_ROOT = process.cwd()

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

const categories = [
  {
    slug: 'technical',
    title: 'Technical',
    icon: '🔧',
    color: '#1a56db',
    order: 1,
    description: 'Technical guides, code references, and implementation documentation.',
  },
  {
    slug: 'operations',
    title: 'Operations',
    icon: '📋',
    color: '#0e9f6e',
    order: 2,
    description: 'Standard operating procedures, fulfillment workflows, and process docs.',
  },
  {
    slug: 'marketing',
    title: 'Marketing',
    icon: '📣',
    color: '#e3a008',
    order: 3,
    description: 'Campaign assets, brand guidelines, and marketing collateral.',
  },
  {
    slug: 'legal',
    title: 'Legal',
    icon: '⚖️',
    color: '#9061f9',
    order: 4,
    description: 'Legal documents, policies, and compliance references.',
  },
  {
    slug: 'templates',
    title: 'Templates',
    icon: '📄',
    color: '#f05252',
    order: 5,
    description: 'Reusable templates and standardized documentation formats.',
  },
  {
    slug: 'integration',
    title: 'Integration',
    icon: '🔌',
    color: '#6366f1',
    order: 6,
    description: 'Integration guides, API references, and system connection documentation.',
  },
]

async function run() {
  const existingDocs = await client.fetch<Array<{_id: string; slug?: {current?: string}}>>(
    '*[_type == "internalDocCategory"]{_id, slug}',
  )

  const publishedBySlug = new Map<string, string>()
  const hasDraftBySlug = new Set<string>()

  for (const doc of existingDocs) {
    const slug = doc.slug?.current
    if (!slug) continue
    if (doc._id.startsWith('drafts.')) {
      hasDraftBySlug.add(slug)
      continue
    }
    publishedBySlug.set(slug, doc._id)
  }

  for (const category of categories) {
    const publishedId = publishedBySlug.get(category.slug) || `internalDocCategory.${category.slug}`

    await client.createIfNotExists({
      _id: publishedId,
      _type: 'internalDocCategory',
      title: category.title,
      slug: {_type: 'slug', current: category.slug},
      description: category.description,
      icon: category.icon,
      color: category.color,
      order: category.order,
      active: true,
    })

    if (publishedBySlug.has(category.slug)) {
      console.log(`Kept existing published: ${category.title} (${publishedId})`)
    } else if (hasDraftBySlug.has(category.slug)) {
      console.log(`Created published from draft seed: ${category.title} (${publishedId})`)
    } else {
      console.log(`Created published: ${category.title} (${publishedId})`)
    }
  }

  console.log('Internal doc category seeding complete.')
}

void run().catch((err) => {
  console.error('Failed to seed internal doc categories:', err)
  process.exit(1)
})
