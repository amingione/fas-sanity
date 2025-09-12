// Netlify function–friendly version of the former Next.js API route.
// NOTE: Netlify only serves functions from `netlify/functions/`.
// After saving this file, MOVE it to `netlify/functions/syncUser.ts`
// and call it at `/.netlify/functions/syncUser`.
//
// This file no longer imports anything from `next`.
//
// Auth:
// We extract the user id (`sub`) from a Bearer JWT in the `Authorization` header.
// If you want full JWT verification, we can wire up `jose` with your Auth0 JWKS,
// but this light decode matches what you had before.

import { client } from '@/lib/client'

// Minimal Netlify handler typing to avoid pulling in external types
type NetlifyHandlerEvent = {
  httpMethod?: string
  headers?: Record<string, string | undefined>
  body?: string | null
}

type NetlifyHandlerResult = {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

type NetlifyHandler = (event: NetlifyHandlerEvent) => Promise<NetlifyHandlerResult>

function decodeJwtSub(authHeader?: string | null): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1]
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payloadJson = Buffer.from(parts[1], 'base64').toString()
    const payload = JSON.parse(payloadJson)
    return typeof payload?.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export const handler: NetlifyHandler = async (event) => {
  // Method guard
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    }
  }

  // Auth guard
  const userId = decodeJwtSub(event.headers?.authorization ?? null)
  if (!userId) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unauthorized' }),
    }
  }

  // Parse body
  let payload: any = {}
  try {
    payload = event.body ? JSON.parse(event.body) : {}
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid JSON body' }),
    }
  }

  const { email, firstName, lastName } = payload as {
    email?: string
    firstName?: string
    lastName?: string
  }

  const customerId = `customer.${userId}`

  try {
    // Create if missing
    await client.createIfNotExists({
      _type: 'customer',
      _id: customerId,
      userId,
      email: email ?? null,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      createdAt: new Date().toISOString(),
    })

    // Always keep these fields up to date
    await client
      .patch(customerId)
      .set({
        email: email ?? null,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        updatedAt: new Date().toISOString(),
      })
      .commit({ autoGenerateArrayKeys: true })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Customer synced successfully' }),
    }
  } catch (error: any) {
    console.error('Failed to sync customer:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Failed to sync customer',
        error: error?.message,
      }),
    }
  }
}

// Optional: keep a default export so non-Netlify callers importing default still work.
export default handler as any
