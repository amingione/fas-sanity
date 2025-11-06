import type { Handler } from '@netlify/functions'

type Group = 'sanity' | 'stripe' | 'resend' | 'cors' | 'base'

const REQUIRED: Record<Group, string[]> = {
  sanity: ['SANITY_STUDIO_PROJECT_ID', 'SANITY_STUDIO_DATASET', 'SANITY_API_TOKEN'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  resend: ['RESEND_API_KEY', 'RESEND_FROM'],
  cors: ['CORS_ALLOW', 'CORS_ORIGIN'],
  base: ['SANITY_STUDIO_NETLIFY_BASE'],
}

function presence(name: string): boolean {
  const v = process.env[name]
  if (!v) return false
  const s = String(v).trim()
  return s.length > 0
}

// --- CORS (align with other functions)
const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  const o = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  const all: Record<string, boolean> = {}
  const missing: Partial<Record<Group, string[]>> = {}
  let ok = true

  for (const group of Object.keys(REQUIRED) as Group[]) {
    const vars = REQUIRED[group]
    for (const key of vars) {
      const has = presence(key)
      all[key] = has
      if (!has) {
        ok = false
        if (!missing[group]) missing[group] = []
        missing[group]!.push(key)
      }
    }
  }

  // Helpful extras
  const extras = {
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || '',
    AUTH0_BASE_URL: process.env.AUTH0_BASE_URL || '',
  }

  return {
    statusCode: ok ? 200 : 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok, missing, present: all, extras }, null, 2),
  }
}
