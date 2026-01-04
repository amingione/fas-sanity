import type {Handler} from '@netlify/functions'

type Group = 'sanity' | 'stripe' | 'resend' | 'easypost' | 'cors' | 'base'

const REQUIRED: Record<Group, string[]> = {
  sanity: ['SANITY_STUDIO_PROJECT_ID', 'SANITY_STUDIO_DATASET', 'SANITY_API_TOKEN'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  resend: ['RESEND_API_KEY', 'RESEND_FROM'],
  easypost: ['EASYPOST_API_KEY', 'EASYPOST_WEBHOOK_SECRET'],
  cors: ['CORS_ALLOW'],
  base: ['SANITY_STUDIO_NETLIFY_BASE'],
}

const FORBIDDEN: string[] = ['VITE_STRIPE_SECRET_KEY', 'VITE_OPENAI_API_KEY']

const DEPRECATED_EXACT: string[] = [
  'SANITY_API_TOKEN',
  'SANITY_API_TOKEN',
  'SANITY_API_TOKEN',
  'SANITY_API_TOKEN',
  'SANITY_API_TOKEN',
  'SANITY_STUDIO_PROJECT_ID',
  'SANITY_STUDIO_DATASET',
  'SANITY_PROJECT',
  'SANITY_PROJECT_DATASET',
  'SANITY_PROJECT_DATASET_NAME',
  'SANITY_DATASET_NAME',
  'SANITY_PUBLIC_PROJECT_ID',
  'SANITY_PUBLIC_DATASET',
  'SANITY_PUBLIC_API_VERSION',
  'SANITY_PUBLIC_READ_TOKEN',
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  'NEXT_PUBLIC_SANITY_DATASET',
  'NEXT_PUBLIC_SANITY_API_VERSION',
  'STRIPE_API_KEY',
  'SANITY_STUDIO_STRIPE_SECRET_KEY',
  'STRIPE_SK',
  'STRIPE_SIGNATURE',
  'STRIPE_SYNC_SECRET',
  'RESEND_KEY',
  'RESEND_SECRET',
  'RESEND_TOKEN',
  'RESEND_SECRET_KEY',
  'EMAIL_FROM',
  'FROM_EMAIL',
  'EMAIL_PROVIDER',
  'CORS_ORIGIN',
]

const DEPRECATED_PREFIXES = ['NEXT_PUBLIC_SANITY_', 'SANITY_PUBLIC_']

function presence(name: string): boolean {
  const v = process.env[name]
  if (!v) return false
  const s = String(v).trim()
  return s.length > 0
}

// --- CORS (align with other functions)
const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
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

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  const all: Record<string, boolean> = {}
  const missing: Partial<Record<Group, string[]>> = {}
  let ok = true
  const forbiddenPresent: string[] = []

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

  for (const name of FORBIDDEN) {
    if (presence(name)) {
      forbiddenPresent.push(name)
      ok = false
    }
  }

  const deprecatedPresent = new Set<string>()
  for (const name of DEPRECATED_EXACT) {
    if (presence(name)) deprecatedPresent.add(name)
  }
  for (const name of Object.keys(process.env)) {
    for (const prefix of DEPRECATED_PREFIXES) {
      if (name.startsWith(prefix)) deprecatedPresent.add(name)
    }
  }

  // Helpful extras
  const extras = {
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || '',
  }

  return {
    statusCode: ok ? 200 : 200,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify(
      {
        ok,
        missing,
        present: all,
        forbidden: forbiddenPresent,
        deprecated: Array.from(deprecatedPresent).sort(),
        extras,
      },
      null,
      2,
    ),
  }
}
