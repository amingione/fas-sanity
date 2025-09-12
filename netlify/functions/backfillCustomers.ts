import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const expected = (process.env.BACKFILL_SECRET || '').trim()
  const presented = ((event.headers?.authorization || '').replace(/^Bearer\s+/i, '') || (event.queryStringParameters?.token || '')).trim()
  if (expected && presented !== expected) return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }

  let dryRun = (event.queryStringParameters?.dryRun || '').toLowerCase() === 'true'
  if (event.httpMethod === 'POST') {
    try { const body = JSON.parse(event.body || '{}'); if (typeof body.dryRun === 'boolean') dryRun = body.dryRun } catch {}
  }

  const pageSize = 200
  let cursor = ''
  let total = 0
  let changed = 0
  let userIdSet = 0
  let optInDefaults = 0
  let updatedStamped = 0

  try {
    while (true) {
      const docs: any[] = await sanity.fetch(
        `*[_type == "customer" && _id > $cursor] | order(_id) {
          _id, userId, authId, auth0Id, updatedAt, emailOptIn, marketingOptIn, textOptIn
        }[0...$limit]`,
        { cursor, limit: pageSize }
      )
      if (!docs?.length) break
      for (const d of docs) {
        total++
        const setOps: Record<string, any> = {}

        if (!d.userId && d.authId) { setOps.userId = d.authId; userIdSet++ }
        else if (!d.userId && d.auth0Id) { setOps.userId = d.auth0Id; userIdSet++ }

        // Default opt-in flags to false if undefined
        const beforeOpt = optInDefaults
        if (typeof d.emailOptIn === 'undefined') { setOps.emailOptIn = false }
        if (typeof d.marketingOptIn === 'undefined') { setOps.marketingOptIn = false }
        if (typeof d.textOptIn === 'undefined') { setOps.textOptIn = false }
        if (optInDefaults === beforeOpt && (typeof d.emailOptIn === 'undefined' || typeof d.marketingOptIn === 'undefined' || typeof d.textOptIn === 'undefined')) {
          optInDefaults++
        }

        // Stamp updatedAt if we will change anything or if it's missing
        const willChange = Object.keys(setOps).length > 0
        if (willChange || !d.updatedAt) { setOps.updatedAt = new Date().toISOString(); updatedStamped++ }

        if (Object.keys(setOps).length) {
          changed++
          if (!dryRun) {
            try { await sanity.patch(d._id).set(setOps).commit({ autoGenerateArrayKeys: true }) } catch {}
          }
        }
        cursor = d._id
      }
      if (docs.length < pageSize) break
    }
  } catch (e: any) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e?.message || 'Backfill customers failed' }) }
  }

  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, dryRun, total, changed, userIdSet, optInDefaults, updatedStamped }) }
}

