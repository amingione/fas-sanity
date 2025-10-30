#!/usr/bin/env node

require('dotenv/config')

const {createClient} = require('@sanity/client')

let cachedFetch = null
const ensureFetch = async () => {
  if (!cachedFetch) {
    if (typeof fetch === 'function') {
      cachedFetch = fetch.bind(globalThis)
    } else {
      const {default: nodeFetch} = await import('node-fetch')
      cachedFetch = nodeFetch
    }
  }
  return cachedFetch
}

const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = process.env.OPENAI_SEO_MODEL || 'gpt-4o-mini'

const getSanityClient = (overrides = {}) => {
  const projectId =
    overrides.projectId || process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
  const dataset = overrides.dataset || process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
  const token =
    overrides.token ||
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_WRITE_TOKEN ||
    process.env.SANITY_AUTH_TOKEN

  if (!projectId || !dataset) {
    throw new Error('Missing Sanity project configuration. Set SANITY_STUDIO_PROJECT_ID and SANITY_STUDIO_DATASET.')
  }

  if (!token) {
    throw new Error(
      'Missing Sanity token. Set SANITY_API_TOKEN (or SANITY_WRITE_TOKEN) to allow metadata updates.',
    )
  }

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-10-01',
    useCdn: false,
  })
}

const fetchGlobalSeo = async (client) => {
  try {
    return await client.fetch(
      `*[_type == "globalSeo"][0]{siteName, metaKeywords, jsonLd, defaultSeo, openGraphDefaults}`,
    )
  } catch (err) {
    console.warn('[seo] Unable to load globalSeo defaults:', err.message)
    return null
  }
}

const callOpenAI = async ({document, globalSeo}) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI credentials. Set OPENAI_API_KEY to enable SEO generation.')
  }

  const prompt = `You are an automotive SEO strategist. Use the provided Sanity document JSON and optional global defaults to craft a compelling meta title, meta description, JSON-LD snippet, and alternative text for the primary hero/open graph image. \n\nReturn valid JSON with the following keys: metaTitle, metaDescription, jsonLd, openGraphAlt.`
  const messages = [
    {role: 'system', content: 'You write persuasive, technically-accurate metadata for performance automotive brands.'},
    {
      role: 'user',
      content: [
        {type: 'text', text: prompt},
        {
          type: 'text',
          text: `Document data: ${JSON.stringify(document)}`,
        },
        {
          type: 'text',
          text: `Global defaults: ${JSON.stringify(globalSeo || {})}`,
        },
      ],
    },
  ]

  const fetchImpl = await ensureFetch()
  const response = await fetchImpl(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.6,
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${errorBody}`)
  }

  const payload = await response.json()
  const message = payload?.choices?.[0]?.message?.content
  if (!message) {
    throw new Error('OpenAI response missing content')
  }

  let cleaned = message.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  }

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse OpenAI response as JSON: ${message} :: ${reason}`)
  }

  return parsed
}

const buildUpdateSet = (document, generated, overwrite = false) => {
  const setPayload = {}
  const ensure = (path, value) => {
    if (value === undefined || value === null || value === '') return
    const existing = path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), document)
    if (existing && !overwrite) return
    setPayload[path] = value
  }

  ensure('seo.metaTitle', generated.metaTitle)
  ensure('seo.metaDescription', generated.metaDescription)
  ensure('seo.jsonLd', generated.jsonLd)
  if (document?.seo?.openGraph?.image?.asset?._ref) {
    ensure('seo.openGraph.image.alt', generated.openGraphAlt)
  }

  return setPayload
}

const generateSeoContentForDocument = async (options = {}) => {
  const {documentId, dataset, projectId, token, document: providedDocument} = options
  if (!documentId && !providedDocument) {
    throw new Error('generateSeoContent requires a documentId or an in-memory document')
  }

  const client = getSanityClient({dataset, projectId, token})
  const doc =
    providedDocument ||
    (await client.fetch('*[_id == $id][0]{..., "seo": coalesce(seo, {})}', {id: documentId}))

  if (!doc) {
    throw new Error(`Document ${documentId} not found in Sanity`)
  }

  const globalSeo = await fetchGlobalSeo(client)
  const generated = await callOpenAI({document: doc, globalSeo})
  const overwrite = process.env.SEO_FORCE_REFRESH === 'true'
  const setPayload = buildUpdateSet(doc, generated, overwrite)

  if (Object.keys(setPayload).length === 0) {
    return {
      updated: false,
      reason: 'No fields required updates',
      documentId: doc._id,
      generated,
    }
  }

  const patch = client.patch(doc._id).setIfMissing({seo: {}}).set(setPayload)
  const result = await patch.commit()
  return {
    updated: true,
    documentId: doc._id,
    set: setPayload,
    generated,
    transactionId: result?._id,
  }
}

if (require.main === module) {
  const [, , docId] = process.argv
  if (!docId) {
    console.error('Usage: node scripts/generateSeoContent.js <documentId>')
    process.exit(1)
  }

  generateSeoContentForDocument({documentId: docId})
    .then((res) => {
      console.log(JSON.stringify(res, null, 2))
    })
    .catch((err) => {
      console.error('[seo] Failed to generate metadata:', err.message)
      process.exit(1)
    })
}

module.exports = {generateSeoContentForDocument}
