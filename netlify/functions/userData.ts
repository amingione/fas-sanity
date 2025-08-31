import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

function decodeJwt(authHeader?: string | null): { sub?: string; email?: string } | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1]
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payloadJson = Buffer.from(parts[1], 'base64').toString()
    const payload = JSON.parse(payloadJson)
    return { sub: payload?.sub, email: payload?.email }
  } catch {
    return null
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, body: '' }
    }
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) }
    }

    const auth = decodeJwt(event.headers?.authorization || null)
    const userId = auth?.sub
    const email = (auth?.email || '').trim().toLowerCase()

    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) }
    }

    const query = `*[_type == "order" && defined(customerEmail) && lower(customerEmail) == $email]{
      _id,
      customerEmail,
      totalAmount,
      status,
      createdAt,
      trackingNumber,
      shippingLabelUrl,
      packingSlipUrl
    } | order(createdAt desc)`

    const orders = email ? await sanity.fetch(query, { email }) : []

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders }),
    }
  } catch (error: any) {
    console.error('userData function error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Failed to fetch user orders' }),
    }
  }
}

export default handler

