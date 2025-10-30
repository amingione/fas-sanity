import type {Handler} from '@netlify/functions'
import 'dotenv/config'

import {generateSeoContentForDocument} from '../../scripts/generateSeoContent'

const SUPPORTED_TYPES = new Set(['product', 'page', 'blog', 'faq', 'seoArticle', 'comparison', 'guide'])

const verifySecret = (event: Parameters<Handler>[0]) => {
  const secret = process.env.SANITY_SEO_WEBHOOK_SECRET
  if (!secret) return true
  const provided =
    event.queryStringParameters?.secret ||
    event.headers['x-sanity-secret'] ||
    event.headers['x-sanity-webhook-secret']
  return provided === secret
}

type SanityWebhookPayload = {
  _id?: string
  _type?: string
  dataset?: string
  projectId?: string
  documentId?: string
  document?: {
    _id?: string
    _type?: string
  }
  ids?: {
    created?: string[]
    updated?: string[]
    deleted?: string[]
    published?: string[]
  }
}

const resolveDocumentId = (payload: SanityWebhookPayload): string | undefined => {
  return (
    payload.documentId ||
    payload.document?._id ||
    payload._id ||
    payload.ids?.published?.[0] ||
    payload.ids?.created?.[0] ||
    payload.ids?.updated?.[0]
  )
}

const resolveDocumentType = (payload: SanityWebhookPayload): string | undefined => {
  return payload.document?._type || payload._type
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    }
  }

  if (!verifySecret(event)) {
    return {
      statusCode: 401,
      body: 'Unauthorized',
    }
  }

  try {
    const payload: SanityWebhookPayload = JSON.parse(event.body || '{}')
    const documentId = resolveDocumentId(payload)
    const documentType = resolveDocumentType(payload)

    if (!documentId) {
      return {
        statusCode: 400,
        body: 'Missing document ID in webhook payload',
      }
    }

    if (documentType && !SUPPORTED_TYPES.has(documentType)) {
      return {
        statusCode: 202,
        body: `Skipping unsupported type: ${documentType}`,
      }
    }

    const result = await generateSeoContentForDocument({
      documentId,
      dataset: payload.dataset,
      projectId: payload.projectId,
    })

    return {
      statusCode: 200,
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({ok: true, documentId, result}),
    }
  } catch (err: any) {
    console.error('[sanity-seo-webhook] failed to process payload', err)
    return {
      statusCode: 500,
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({ok: false, error: err?.message ?? 'Unknown error'}),
    }
  }
}
