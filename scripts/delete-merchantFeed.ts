#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {once} from 'node:events'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const API_VERSION = '2024-10-01'
const envFiles = ['.env.local', '.env.development', '.env']
for (const file of envFiles) {
  const fullPath = path.resolve(process.cwd(), file)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity config (projectId, dataset, or token).')
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: API_VERSION, useCdn: false})
const yesFlag = process.argv.includes('--yes')
const dryRun = process.argv.includes('--dry-run')

function createBackupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.resolve(process.cwd(), 'backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})
  return path.join(dir, `merchantFeed-backup-${stamp}.json`)
}

async function promptConfirm(message: string): Promise<boolean> {
  if (yesFlag) return true
  const rl = readline.createInterface({input: process.stdin, output: process.stdout})
  rl.setPrompt(`${message} (y/N): `)
  rl.prompt()
  const [answer] = (await once(rl, 'line')) as [string]
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

async function fetchMerchantFeedDocs() {
  const query = '*[_type == "merchantFeed"]|order(_updatedAt desc){_id,_type,_rev,_updatedAt,sku,title}'
  return client.fetch<Array<Record<string, any>>>(query, {}, {perspective: 'previewDrafts'})
}

async function exportBackup(docs: Array<Record<string, any>>) {
  const backupPath = createBackupPath()
  fs.writeFileSync(backupPath, JSON.stringify({exportedAt: new Date().toISOString(), docs}, null, 2))
  console.log(`Backup written to ${backupPath}`)
}

async function deleteDocs(docs: Array<Record<string, any>>) {
  if (!docs.length) return {deleted: 0}
  const tx = client.transaction()
  for (const doc of docs) {
    tx.delete(doc._id)
  }
  await tx.commit({autoGenerateArrayKeys: true})
  return {deleted: docs.length}
}

function printSummary(docs: Array<Record<string, any>>) {
  console.log(`\nFound ${docs.length} merchantFeed document(s):`)
  docs.forEach((doc) => {
    const labelParts = [doc._id]
    if (doc.sku) labelParts.push(`sku=${doc.sku}`)
    if (doc.title) labelParts.push(`title=${doc.title}`)
    if (doc._updatedAt) labelParts.push(`updated=${doc._updatedAt}`)
    console.log(` - ${labelParts.join(' | ')}`)
  })
}

async function run() {
  console.log('Sanity project:', projectId)
  console.log('Dataset:', dataset)
  console.log('API version:', API_VERSION)
  console.log('Dry run:', dryRun)

  const docs = await fetchMerchantFeedDocs()
  printSummary(docs)

  if (!docs.length) {
    console.log('Nothing to delete. Exiting.')
    return
  }

  await exportBackup(docs)

  if (dryRun) {
    console.log('Dry run enabled. No deletions performed.')
    return
  }

  const confirmed = await promptConfirm('Proceed with deleting ALL merchantFeed documents?')
  if (!confirmed) {
    console.log('Aborted by user. No documents were deleted.')
    return
  }

  console.log('Deleting documents...')
  const result = await deleteDocs(docs)
  console.log(`Deleted ${result.deleted} merchantFeed document(s).`)
}

run().catch((err) => {
  console.error('Failed to delete merchantFeed documents:', err)
  process.exit(1)
})
