import type { Handler } from '@netlify/functions'

type Group = 'sanity' | 'stripe' | 'resend' | 'shipengine' | 'cors' | 'base'

const REQUIRED: Record<Group, string[]> = {
  sanity: ['SANITY_STUDIO_PROJECT_ID', 'SANITY_STUDIO_DATASET', 'SANITY_API_TOKEN'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  resend: ['RESEND_API_KEY', 'RESEND_FROM'],
  shipengine: ['SHIPENGINE_API_KEY'],
  cors: ['CORS_ALLOW', 'CORS_ORIGIN'],
  base: ['SANITY_STUDIO_NETLIFY_BASE'],
}

function presence(name: string): boolean {
  const v = process.env[name]
  if (!v) return false
  const s = String(v).trim()
  return s.length > 0
}

export const handler: Handler = async (event) => {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok, missing, present: all, extras }, null, 2),
  }
}

