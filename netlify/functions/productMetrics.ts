import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {computeProductMetrics} from '../../shared/productMetrics'

const API_VERSION = '2024-10-01'
const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const sanity =
  projectId && dataset
    ? createClient({
        projectId,
        dataset,
        apiVersion: API_VERSION,
        token,
        useCdn: false,
      })
    : null

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {...jsonHeaders, 'Cache-Control': 'no-store'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!sanity || !projectId || !dataset) {
    return {
      statusCode: 500,
      headers: {...jsonHeaders, 'Cache-Control': 'no-store'},
      body: JSON.stringify({error: 'Sanity project configuration is missing'}),
    }
  }

  if (!token) {
    return {
      statusCode: 500,
      headers: {...jsonHeaders, 'Cache-Control': 'no-store'},
      body: JSON.stringify({error: 'SANITY_API_TOKEN is required to read metrics'}),
    }
  }

  try {
    const metrics = await computeProductMetrics(sanity)
    return {
      statusCode: 200,
      headers: {
        ...jsonHeaders,
        'Cache-Control': 'max-age=30, stale-while-revalidate=120',
      },
      body: JSON.stringify({
        ...metrics,
        updatedAt: new Date().toISOString(),
      }),
    }
  } catch (error: any) {
    console.error('productMetrics function error:', error)
    return {
      statusCode: 500,
      headers: {...jsonHeaders, 'Cache-Control': 'no-store'},
      body: JSON.stringify({
        error: 'Failed to compute product metrics',
        detail: error?.message || String(error),
      }),
    }
  }
}

export default handler
