import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

const isEnabled = process.env.LOG_DRAIN_ENABLED?.toLowerCase() !== 'false'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2024-04-10',
  useCdn: false,
})

const LOG_DRAIN_QUERY = '*[_type == "logDrain" && enabled == true]{_id, name, provider, url, headers}'

type SanityLogDrain = {
  _id: string
  name: string
  provider: string
  url: string
  headers?: Array<{key?: string; value?: string}>
}

const buildHeaders = (entries?: Array<{key?: string; value?: string}>) => {
  const headers: Record<string, string> = {'Content-Type': 'application/json'}
  entries?.forEach((entry) => {
    if (entry?.key) {
      headers[entry.key] = entry.value ?? ''
    }
  })
  return headers
}

const sendLogToDrain = async (drain: SanityLogDrain, event: unknown) => {
  const response = await fetch(drain.url, {
    method: 'POST',
    headers: buildHeaders(drain.headers),
    body: JSON.stringify(event),
  })
  return {drainId: drain._id, status: response.status, ok: response.ok}
}

export const handler: Handler = async (event) => {
  if (!isEnabled) {
    return {
      statusCode: 200,
      body: JSON.stringify({success: true, message: 'Log drains disabled'}),
    }
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  let logEvent: unknown

  try {
    logEvent = JSON.parse(event.body ?? '{}')
  } catch (error) {
    console.error('Failed to parse log event payload', error)
    return {statusCode: 400, body: JSON.stringify({error: 'Invalid JSON'})}
  }

  try {
    const drains = await sanity.fetch<SanityLogDrain[]>(LOG_DRAIN_QUERY)

    const settled = await Promise.allSettled(
      (drains ?? []).map((drain) => sendLogToDrain(drain, logEvent)),
    )

    const results = settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      return {
        drainId: drains?.[index]?._id,
        error: (result.reason as Error)?.message ?? 'Unknown error',
      }
    })

    return {
      statusCode: 200,
      body: JSON.stringify({success: true, results}),
    }
  } catch (error) {
    console.error('Log drain proxy error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({error: 'Failed to process log event'}),
    }
  }
}
