import {fetchStripeAnalytics} from '../src/server/stripe-analytics'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

export default async function handler(request: Request): Promise<Response> {
  const method = request.method?.toUpperCase() || 'GET'
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...JSON_HEADERS,
        Allow: 'GET,HEAD,OPTIONS',
      },
    })
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(JSON.stringify({error: 'Method Not Allowed'}), {
      status: 405,
      headers: {
        ...JSON_HEADERS,
        Allow: 'GET,HEAD,OPTIONS',
      },
    })
  }

  try {
    ensureStudioHeaders(request.headers)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    return new Response(JSON.stringify({error: message}), {status: 401, headers: JSON_HEADERS})
  }

  try {
    const analytics = await fetchStripeAnalytics()
    if (method === 'HEAD') {
      return new Response(null, {status: 200, headers: JSON_HEADERS})
    }
    return new Response(JSON.stringify(analytics), {status: 200, headers: JSON_HEADERS})
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load Stripe analytics'
    const status = /missing STRIPE_SECRET_KEY/i.test(message) ? 503 : 500
    console.error('stripe-analytics API failed', err)
    return new Response(JSON.stringify({error: message}), {status, headers: JSON_HEADERS})
  }
}

function ensureStudioHeaders(headers: Headers) {
  const projectHeader = headers.get('x-sanity-project-id')?.trim()
  const datasetHeader = headers.get('x-sanity-dataset')?.trim()
  const expectedProject =
    process.env.SANITY_STUDIO_PROJECT_ID || null
  const expectedDataset =
    process.env.SANITY_STUDIO_DATASET || null

  if (expectedProject && projectHeader && projectHeader !== expectedProject) {
    throw new Error('Invalid project header')
  }
  if (expectedDataset && datasetHeader && datasetHeader !== expectedDataset) {
    throw new Error('Invalid dataset header')
  }
  if (!projectHeader || !datasetHeader) {
    throw new Error('Missing Sanity headers')
  }
}

