import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {
  buildMerchantFeedRows,
  merchantFeedRowsToCsv,
  type MerchantFeedDocument,
  type MerchantFeedRow,
} from '../../shared/merchantFeed'

const SANITY_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd'
const SANITY_DATASET = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN
const MERCHANT_FEED_SECRET = process.env.MERCHANT_FEED_API_SECRET

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-04-10',
  useCdn: false,
  token: SANITY_API_TOKEN,
})

function responseHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-merchant-feed-secret',
  }
}

function isAuthorized(event: Parameters<Handler>[0]): boolean {
  if (!MERCHANT_FEED_SECRET) return true
  const headerSecret =
    event.headers['x-merchant-feed-secret'] || event.headers['X-MERCHANT-FEED-SECRET']
  const querySecret = event.queryStringParameters?.secret
  return headerSecret === MERCHANT_FEED_SECRET || querySecret === MERCHANT_FEED_SECRET
}

type MerchantFeedQueryResult = MerchantFeedDocument & {_id: string}

type MerchantFeedApiResponse = {
  generatedAt: string
  count: number
  total: number
  rows: MerchantFeedRow[]
  skipped: Array<{id: string; reason: string}>
}

async function fetchMerchantFeedDocuments(): Promise<MerchantFeedQueryResult[]> {
  return sanity.fetch(
    `*[_type == "merchantFeed" && defined(sku)] | order(sku asc) {
      _id,
      sku,
      gtin,
      mpn,
      title,
      description,
      link,
      image_link,
      availability,
      price,
      sale_price,
      brand
    }`,
  )
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: responseHeaders('text/plain'), body: ''}
  }

  if (!isAuthorized(event)) {
    return {
      statusCode: 401,
      headers: responseHeaders('application/json'),
      body: JSON.stringify({error: 'Unauthorized'}),
    }
  }

  try {
    const documents = await fetchMerchantFeedDocuments()
    const {rows, skipped, total} = buildMerchantFeedRows(documents)
    const generatedAt = new Date().toISOString()
    const format = (event.queryStringParameters?.format || 'json').toLowerCase()

    if (format === 'csv' || format === 'tsv') {
      const csvBody = merchantFeedRowsToCsv(rows)
      return {
        statusCode: 200,
        headers: {
          ...responseHeaders('text/csv; charset=utf-8'),
          'Content-Disposition': `attachment; filename="merchant-feed-${generatedAt}.csv"`,
        },
        body: csvBody,
      }
    }

    const payload: MerchantFeedApiResponse = {
      generatedAt,
      count: rows.length,
      total,
      rows,
      skipped,
    }

    return {
      statusCode: 200,
      headers: responseHeaders('application/json'),
      body: JSON.stringify(payload),
    }
  } catch (error) {
    console.error('[merchantFeed] Failed to build feed', error)
    return {
      statusCode: 500,
      headers: responseHeaders('application/json'),
      body: JSON.stringify({error: 'Failed to generate merchant feed'}),
    }
  }
}
