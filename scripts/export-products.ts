#!/usr/bin/env tsx

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient, type SanityClient} from '@sanity/client'
import {requireSanityCredentials} from '../netlify/lib/sanityEnv'

type ExportMode = 'content' | 'full'

type Args = {
  mode: ExportMode
  outCsv: string
  outJson?: string
  includeDrafts: boolean
  limit?: number
}

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']

function loadEnvFiles() {
  for (const filename of ENV_FILES) {
    const filePath = path.resolve(process.cwd(), filename)
    if (fs.existsSync(filePath)) {
      dotenv.config({path: filePath, override: false})
    }
  }
}

function createSanityClient(): SanityClient {
  const {projectId, dataset, token} = requireSanityCredentials()
  return createClient({projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false})
}

function formatTimestampUtc(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const y = date.getUTCFullYear()
  const m = pad(date.getUTCMonth() + 1)
  const d = pad(date.getUTCDate())
  const hh = pad(date.getUTCHours())
  const mm = pad(date.getUTCMinutes())
  const ss = pad(date.getUTCSeconds())
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: 'content',
    outCsv: path.join('exports', `products-${formatTimestampUtc()}.csv`),
    includeDrafts: false,
  }

  const takeValue = (i: number, flag: string) => {
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`)
    }
    return value
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--') {
      continue
    }
    if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    }

    if (token === '--mode') {
      const value = takeValue(i, '--mode')
      if (value !== 'content' && value !== 'full') {
        throw new Error(`Invalid --mode "${value}". Expected "content" or "full".`)
      }
      args.mode = value
      i++
      continue
    }

    if (token === '--out') {
      args.outCsv = takeValue(i, '--out')
      i++
      continue
    }

    if (token === '--json') {
      args.outJson = takeValue(i, '--json')
      i++
      continue
    }

    if (token === '--include-drafts') {
      args.includeDrafts = true
      continue
    }

    if (token === '--limit') {
      const value = takeValue(i, '--limit')
      const limit = Number(value)
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid --limit "${value}". Expected a positive number.`)
      }
      args.limit = Math.floor(limit)
      i++
      continue
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  return args
}

function printHelp() {
  console.log(`Export Sanity product documents to CSV.

USAGE
  pnpm tsx scripts/export-products.ts [options]

OPTIONS
  --mode <content|full>    Default: content
  --out <path>             Default: exports/products-<timestamp>.csv
  --json <path>            Also write the exported records to JSON
  --include-drafts         Include drafts.* documents
  --limit <n>              Export only the first n documents

NOTES
  - fas-sanity is content-only. Medusa remains the commerce authority for pricing, inventory, and checkout.
  - The CSV stores complex fields (arrays/objects) as JSON strings in cells.`)
}

function normalizeProductDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const slug = doc.slug
  if (slug && typeof slug === 'object' && 'current' in slug) {
    const current = (slug as {current?: unknown}).current
    if (typeof current === 'string') {
      return {...doc, slug: current}
    }
  }
  return doc
}

const CONTENT_COLUMNS: string[] = [
  '_createdAt',
  '_id',
  '_rev',
  '_type',
  '_updatedAt',
  'title',
  'displayTitle',
  'slug',
  'contentStatus',
  'featured',
  'promotionTagline',
  'shortDescription',
  'description',
  'keyFeatures',
  'importantNotes',
  'specifications',
  'attributes',
  'includedInKit',
  'mediaAssets',
  'images',
  'options',
  'addOns',
  'bundleAddOns',
  'category',
  'filters',
  'customPaint',
  'compatibleVehicles',
  'tunes',
  'metaTitle',
  'metaDescription',
  'focusKeyword',
  'seoKeywords',
  'socialImage',
  'socialImageAlt',
  'canonicalUrl',
  'metaRobots',
  'structuredData',
  'brand',
  'gtin',
  'mpn',
  'googleProductCategory',
  'medusaProductId',
  'medusaVariantId',
  'lastSyncedFromMedusa',
]

const SYSTEM_COLUMN_ORDER = new Map(
  [
    '_createdAt',
    '_id',
    '_rev',
    '_system',
    '_type',
    '_updatedAt',
  ].map((key, index) => [key, index]),
)

function sortColumns(columns: string[]): string[] {
  return [...new Set(columns)].sort((a, b) => {
    const aSystem = SYSTEM_COLUMN_ORDER.get(a)
    const bSystem = SYSTEM_COLUMN_ORDER.get(b)
    if (typeof aSystem === 'number' && typeof bSystem === 'number') return aSystem - bSystem
    if (typeof aSystem === 'number') return -1
    if (typeof bSystem === 'number') return 1
    return a.localeCompare(b)
  })
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const raw =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : JSON.stringify(value)

  if (raw.includes('"')) {
    const escaped = raw.replaceAll('"', '""')
    return `"${escaped}"`
  }

  if (raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw}"`
  }

  return raw
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(',')
  const lines = rows.map((row) => columns.map((column) => toCsvCell(row[column])).join(','))
  return [header, ...lines].join('\n') + '\n'
}

function pickColumns(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const column of columns) picked[column] = row[column]
  return picked
}

async function ensureParentDir(filePath: string) {
  const parent = path.dirname(filePath)
  await fsp.mkdir(parent, {recursive: true})
}

async function main() {
  loadEnvFiles()
  const args = parseArgs(process.argv.slice(2))

  const sanity = createSanityClient()
  const whereDrafts = args.includeDrafts ? '' : ' && !(_id in path("drafts.**"))'
  const limitClause = typeof args.limit === 'number' ? `[0...${args.limit}]` : ''
  const query = `*[_type == "product"${whereDrafts}]|order(_updatedAt desc)${limitClause}`

  console.log(`Fetching products from Sanity (${args.mode} export)...`)
  const docs = await sanity.fetch<Record<string, unknown>[]>(query)
  const normalized = docs.map(normalizeProductDoc)

  const rows =
    args.mode === 'content'
      ? normalized.map((row) => pickColumns(row, CONTENT_COLUMNS))
      : normalized

  const columns =
    args.mode === 'content'
      ? CONTENT_COLUMNS
      : sortColumns(rows.flatMap((row) => Object.keys(row)))

  await ensureParentDir(args.outCsv)
  await fsp.writeFile(args.outCsv, toCsv(rows, columns), 'utf8')
  console.log(`Wrote CSV: ${args.outCsv} (${rows.length} rows)`)

  if (args.outJson) {
    await ensureParentDir(args.outJson)
    await fsp.writeFile(args.outJson, JSON.stringify(rows, null, 2) + '\n', 'utf8')
    console.log(`Wrote JSON: ${args.outJson}`)
  }
}

main().catch((error) => {
  console.error('Product export failed:', error)
  process.exit(1)
})
