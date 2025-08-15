// netlify/functions/syncAuth0User.ts
import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

const SHARED_SECRET = process.env.AUTH0_SYNC_SECRET || '' // same as in Auth0 action

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID, // or SANITY_PROJECT_ID
  dataset: process.env.SANITY_STUDIO_DATASET,     // or SANITY_DATASET
  token: process.env.SANITY_API_TOKEN,
  apiVersion: process.env.SANITY_API_VERSION || '2024-04-10',
  useCdn: false,
})

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    const sig = event.headers['x-auth0-signature']
    if (!sig || sig !== SHARED_SECRET) {
      return { statusCode: 401, body: 'Unauthorized' }
    }

    const payload = JSON.parse(event.body || '{}') as {
      sub?: string
      email?: string
      given_name?: string
      family_name?: string
      name?: string
      user_metadata?: Record<string, unknown>
      app_metadata?: Record<string, unknown>
    }

    const auth0Id = payload.sub
    const email = payload.email
    if (!auth0Id || !email) {
      return { statusCode: 400, body: 'Missing sub or email' }
    }

    const firstName =
      (payload.given_name as string) ||
      (payload.user_metadata?.firstName as string) ||
      (payload.name?.split(' ')[0] ?? '')
    const lastName =
      (payload.family_name as string) ||
      (payload.user_metadata?.lastName as string) ||
      (payload.name?.split(' ').slice(1).join(' ') ?? '')

    // Prefer explicit role from metadata; else default to "customer"
    const roleFromMeta =
      (payload.app_metadata?.role as string) ||
      (payload.user_metadata?.userRole as string)
    const userRole =
      roleFromMeta === 'vendor' || roleFromMeta === 'admin' ? roleFromMeta : 'customer'

    // Stable document id based on Auth0 sub
    const _id = `customer-${auth0Id}`

    // Upsert
    await sanity
      .transaction()
      .createIfNotExists({
        _id,
        _type: 'customer',
        firstName,
        lastName,
        email,
        auth0Id,
        userRole, // default on first create
      })
      .patch(_id, (p) =>
        p
          .setIfMissing({ _type: 'customer', auth0Id })
          .set({
            // keep these in sync on subsequent logins
            email,
            firstName,
            lastName,
          })
          .setIfMissing({ userRole }) // don’t downgrade if it was later changed in Studio
      )
      .commit()

    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: 'Server error' }
  }
}