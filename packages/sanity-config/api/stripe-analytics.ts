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

  // Architecture enforcement: Stripe access is prohibited outside Medusa.
  // This endpoint remains for backwards compatibility with Studio UI, but the
  // data source must move to Medusa-owned reporting.
  try {
    ensureStudioHeaders(request.headers)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    return new Response(JSON.stringify({error: message}), {status: 401, headers: JSON_HEADERS})
  }

  const error =
    '410 GONE: Stripe analytics is disabled in fas-sanity. Use Medusa for Stripe reporting.'
  if (method === 'HEAD') {
    return new Response(null, {status: 410, headers: JSON_HEADERS})
  }
  return new Response(JSON.stringify({error}), {status: 410, headers: JSON_HEADERS})
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
