#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const fullPath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const TARGET_DOCUMENT_ID = '0fe67925-f64c-46f3-8b85-6914512f1e9d'
const API_VERSION = '2024-10-01'

async function main() {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd'
  const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
  const token =
    process.env.SANITY_API_TOKEN

  if (!token) {
    throw new Error('Set SANITY_API_TOKEN (or SANITY_API_TOKEN) before running this script.')
  }

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: API_VERSION,
    useCdn: false,
  })

  const existingDoc = await client.getDocument(TARGET_DOCUMENT_ID)
  if (!existingDoc) {
    throw new Error(`Download resource ${TARGET_DOCUMENT_ID} was not found.`)
  }

  await client
    .patch(existingDoc._id)
    .set({
      documentType: 'download',
      category: 'technical',
      accessLevel: 'internal',
      version: 'v1.0',
      isTemplate: false,
      lastUpdated: new Date().toISOString(),
    })
    .commit()

  console.log(`Download resource ${existingDoc._id} migrated.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
