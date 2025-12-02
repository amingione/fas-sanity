import 'dotenv/config'
import {createClient} from '@sanity/client'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT
const dataset =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || process.env.SANITY_DB
const token =
  process.env.SANITY_API_TOKEN ||
    process.env.SANITY_STUDIO_API_TOKEN ||
    process.env.SANITY_WRITE_TOKEN ||
    process.env.SANITY_AUTH_TOKEN ||
  ''

if (!projectId || !dataset || !token) {
  console.error(
    '[ensure-email-marketing-channel] Missing Sanity credentials (projectId/dataset/token).',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

async function run() {
  const channelId = 'marketingChannel.email'
  const apiKeyValue = process.env.RESEND_API_KEY ? 'env:RESEND_API_KEY' : undefined

  const existing = await client.fetch<{_id: string} | null>(
    `*[_type == "marketingChannel" && name == "email"][0]{_id}`,
  )

  if (existing?._id) {
    await client
      .patch(existing._id)
      .set({
        name: 'email',
        apiKey: apiKeyValue,
        endpoint: 'https://api.resend.com',
        active: true,
      })
      .commit({autoGenerateArrayKeys: true})
    console.log(`[ensure-email-marketing-channel] Updated marketingChannel "${existing._id}".`)
    return
  }

  await client.create({
    _id: channelId,
    _type: 'marketingChannel',
    name: 'email',
    apiKey: apiKeyValue,
    endpoint: 'https://api.resend.com',
    active: true,
    accountId: null,
  })

  console.log('[ensure-email-marketing-channel] Created marketingChannel "email".')
}

run().catch((err) => {
  console.error('[ensure-email-marketing-channel] Failed', err)
  process.exit(1)
})
