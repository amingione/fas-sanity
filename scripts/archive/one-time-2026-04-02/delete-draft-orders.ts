import {createClient} from '@sanity/client'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const client = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  token: process.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const draftIds = [
  'drafts.An8D8HJGGIJqPkBywv6qKG',
  'drafts.QcZOD0bpnieAJuccRLfrFd',
  'drafts.RE3r5aYxzVFyL8S0l2X4AA',
  'drafts.SoyCAbrF4SPOxAFbjuFVvj',
  'drafts.WND3u2R0zuuaLwXIAe6wyA',
  'drafts.X7c0ilkOWSKxjFrO3LVGXE',
  'drafts.bsdaB5yTTfnN2hUF2L2ueC',
  'drafts.m0vuBZO5SDdbCbNZN5nKX3',
  'drafts.ujVXdrfUy7mAVm7Wpyzz8q',
  'drafts.xVnPuN5l3oZUVWqyspmUxe',
]

async function deleteDrafts() {
  console.log(`Deleting ${draftIds.length} draft orders...`)

  for (const id of draftIds) {
    try {
      await client.delete(id)
      console.log(`✅ Deleted: ${id}`)
    } catch (error) {
      console.error(`❌ Failed to delete ${id}:`, error)
    }
  }

  console.log('Done!')
}

deleteDrafts()
