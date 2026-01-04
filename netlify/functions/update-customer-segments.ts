import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {
  CUSTOMER_METRICS_QUERY,
  buildCustomerMetricsPatch,
  metricsChanged,
  type CustomerMetricsSource,
} from '../lib/customerSegments'

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''
const SANITY_STUDIO_DATASET = process.env.SANITY_STUDIO_DATASET || 'production'
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN || ''
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'

const client =
  SANITY_STUDIO_PROJECT_ID && SANITY_API_TOKEN
    ? createClient({
        projectId: SANITY_STUDIO_PROJECT_ID,
        dataset: SANITY_STUDIO_DATASET,
        apiVersion: API_VERSION,
        token: SANITY_API_TOKEN,
        useCdn: false,
      })
    : null

const handler: Handler = async (event) => {
  if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!client) {
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Sanity credentials are not configured'}),
    }
  }

  const limitParam = event.queryStringParameters?.limit
  const limit = Number.parseInt(limitParam || '', 10)
  const batchLimit = Number.isFinite(limit) && limit > 0 ? limit : 5000
  const now = new Date()

  try {
    const customers = await client.fetch<CustomerMetricsSource[]>(CUSTOMER_METRICS_QUERY, {
      limit: batchLimit,
    })

    let updated = 0
    let skipped = 0

    for (const customer of customers) {
      if (!customer?._id) {
        skipped++
        continue
      }
      const patch = buildCustomerMetricsPatch(customer, now)
      if (!metricsChanged(patch, customer.current)) {
        skipped++
        continue
      }
      await client
        .patch(customer._id)
        .set(patch)
        .commit()
        .then(() => {
          updated++
        })
        .catch((error) => {
          skipped++
          console.warn('Failed to update customer metrics', customer._id, error)
        })
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        total: customers.length,
        updated,
        skipped,
        limit: batchLimit,
      }),
    }
  } catch (error) {
    console.error('update-customer-segments failed', error)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}

export {handler}
