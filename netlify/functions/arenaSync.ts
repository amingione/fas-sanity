import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { syncArenaChannels } from 'arena-sanity-core/dist/index.js'

type SyncBody = {
  channelSlugs?: string[]
  options?: Record<string, unknown>
  test?: boolean
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

function parseAuthToken(headerValue?: string | string[] | undefined): string | null {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!raw) return null
  const parts = raw.split(/\s+/)
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) return parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || '',
  dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const ARENA_API_BASE = 'https://api.are.na/v2'

type ArenaChannelPage = {
  contents: any[]
  total_pages?: number
  title?: string
}

async function fetchArena<T = ArenaChannelPage>(endpoint: string, token: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(`${ARENA_API_BASE}/${endpoint}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Are.na request failed (${res.status} ${res.statusText}): ${text}`)
  }
  return res.json() as Promise<T>
}

const buildArenaClient = (token: string) => ({
  getChannelPage: async (slug: string, params: { page: number; per: number }) => {
    const data = await fetchArena<ArenaChannelPage>(`channels/${slug}`, token, {
      page: params.page,
      per: params.per,
    })
    return {
      contents: data.contents || [],
      total_pages: data.total_pages,
      title: data.title,
    }
  },
  getChannelInfo: async (slug: string) => {
    try {
      const data = await fetchArena<ArenaChannelPage>(`channels/${slug}`, token, { per: 1 })
      return { title: data.title }
    } catch (err) {
      console.warn('arenaSync: failed to load channel info', slug, err)
      return { title: undefined }
    }
  },
})

async function resolveChannelSlugs(body: SyncBody): Promise<string[]> {
  if (Array.isArray(body.channelSlugs) && body.channelSlugs.length > 0) {
    return body.channelSlugs.map((slug) => String(slug).trim()).filter(Boolean)
  }

  try {
    const config = await sanity.fetch<{ channelSlugs?: string[] } | null>(
      '*[_id == "arenaSyncConfig"][0]{channelSlugs}'
    )
    if (Array.isArray(config?.channelSlugs) && config.channelSlugs.length > 0) {
      return config.channelSlugs.map((slug) => String(slug).trim()).filter(Boolean)
    }
  } catch (err) {
    console.warn('arenaSync: unable to load arenaSyncConfig document', err)
  }

  const envSlugs = (process.env.ARENA_CHANNEL_SLUGS || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
  return envSlugs
}

const updateConfigAfterSync = async ({
  channelSlugs,
  status,
  success,
  syncRunId,
}: {
  channelSlugs: string[]
  status: string
  success: boolean
  syncRunId: string
}) => {
  try {
    const now = new Date().toISOString()
    const patch = sanity.patch('arenaSyncConfig')
    patch.set({
      lastSyncDate: now,
      lastSyncStatus: status,
      lastSyncRunId: syncRunId,
      ...(success ? { lastSuccessfullySyncedSlugs: channelSlugs } : {}),
    })
    patch.setIfMissing({
      _type: 'arenaSyncConfig',
      channelSlugs: [],
    })
    await patch.commit({ autoGenerateArrayKeys: true })
  } catch (err) {
    console.warn('arenaSync: failed to update arenaSyncConfig document after sync', err)
  }
}

function buildResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body, null, 2),
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return buildResponse(405, { error: 'Method Not Allowed' })
  }

  const requiredSecret = process.env.ARENA_SYNC_SECRET
  const providedSecret = parseAuthToken(
    event.headers.authorization || event.headers.Authorization || event.headers['x-authorization']
  )

  if (requiredSecret) {
    if (!providedSecret || providedSecret !== requiredSecret) {
      return buildResponse(401, { error: 'Unauthorized' })
    }
  }

  const arenaToken = process.env.ARENA_ACCESS_TOKEN
  if (!arenaToken) {
    return buildResponse(500, { error: 'Missing ARENA_ACCESS_TOKEN environment variable' })
  }

  if (!process.env.SANITY_API_TOKEN) {
    return buildResponse(500, { error: 'Missing SANITY_API_TOKEN environment variable' })
  }

  let body: SyncBody = {}
  try {
    if (event.body) {
      body = JSON.parse(event.body)
    }
  } catch (err) {
    return buildResponse(400, { error: 'Invalid JSON body', details: String(err) })
  }

  if (body?.test) {
    return buildResponse(200, { ok: true, message: 'Test ping acknowledged' })
  }

  const channelSlugs = (await resolveChannelSlugs(body)).filter(Boolean)
  if (!channelSlugs.length) {
    return buildResponse(400, { error: 'No channel slugs provided (body.channelSlugs, arenaSyncConfig, or ARENA_CHANNEL_SLUGS)' })
  }

  const arenaClient = buildArenaClient(arenaToken)

  const syncOptions = {
    channels: channelSlugs,
    imageUpload: 'auto' as const,
    normalizeChannels: true,
    ...(body.options || {}),
  }

  try {
    const result = await syncArenaChannels({
      arena: arenaClient,
      sanity: sanity as any,
      options: syncOptions,
    })

    await updateConfigAfterSync({
      channelSlugs,
      status: result.message || (result.success ? 'Sync complete' : 'Sync completed with issues'),
      success: Boolean(result.success),
      syncRunId: result.syncRunId,
    })

    return buildResponse(200, {
      ok: true,
      success: result.success,
      message: result.message,
      updatedOrCreated: result.updatedOrCreated,
      channels: result.channels,
      syncRunId: result.syncRunId,
    })
  } catch (err: any) {
    const message = err?.message || 'Sync failed'
    await updateConfigAfterSync({
      channelSlugs,
      status: `Sync error: ${message}`,
      success: false,
      syncRunId: `error-${Date.now()}`,
    })
    console.error('arenaSync: sync failed', err)
    return buildResponse(500, { ok: false, error: message })
  }
}
