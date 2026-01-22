#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import {register} from 'node:module'
import dotenv from 'dotenv'
import {createClient, type SanityClient} from '@sanity/client'
import {requireSanityCredentials} from '../netlify/lib/sanityEnv'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function createSanityClient(): SanityClient {
  const {projectId, dataset, token} = requireSanityCredentials()
  return createClient({projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false})
}

async function main() {
  register(new URL('./loaders/ignore-css.mjs', import.meta.url))
  const {schemaTypes} = await import('../packages/sanity-config/src/schemaTypes')
  const sanity = createSanityClient()
  const documentTypes = schemaTypes
    .filter((schema) => schema?.type === 'document')
    .map((schema) => schema?.name)
    .filter((name): name is string => Boolean(name))

  if (!documentTypes.length) {
    console.log('No document types found in schema registry.')
    return
  }

  console.log(`Auditing ${documentTypes.length} document types...`)

  const results: Array<{type: string; count: number}> = []
  for (const type of documentTypes) {
    const count = await sanity.fetch<number>('count(*[_type == $type])', {type})
    results.push({type, count})
    console.log(`${type}: ${count}`)
  }

  const unused = results.filter((entry) => entry.count === 0)
  if (unused.length) {
    console.log('\nUnused document types (count=0):')
    for (const entry of unused) {
      console.log(`- ${entry.type}`)
    }
  } else {
    console.log('\nAll document types have at least one document.')
  }
}

main().catch((error) => {
  console.error('Schema type audit failed:', error)
  process.exit(1)
})
