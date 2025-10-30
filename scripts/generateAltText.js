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
const OPENAI_MODEL = process.env.OPENAI_ALT_MODEL || process.env.OPENAI_SEO_MODEL || 'gpt-4o-mini'

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
    throw new Error('Missing Sanity project configuration for alt text generation.')
  }
  if (!token) {
    throw new Error('Missing Sanity token (SANITY_API_TOKEN). Alt text cannot be updated without it.')
  }

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-10-01',
    useCdn: false,
  })
}

const callOpenAI = async (asset) => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI credentials. Set OPENAI_API_KEY.')
  }

  const context = {
    filename: asset.originalFilename,
    dominantColor: asset.metadata?.palette?.dominant,
    dimensions: asset.metadata?.dimensions,
    url: asset.url,
  }

  const prompt = `Write descriptive, keyword-rich alt text (max 120 characters) for an automotive e-commerce asset. Mention any make/model or product hints from the filename. Avoid promotional language.`

  const messages = [
    {role: 'system', content: 'You craft concise, descriptive alt text for automotive product imagery.'},
    {
      role: 'user',
      content: [
        {type: 'text', text: prompt},
        {type: 'text', text: `Asset context: ${JSON.stringify(context)}`},
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
    body: JSON.stringify({model: OPENAI_MODEL, temperature: 0.4, messages}),
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

  return cleaned.replace(/^"|"$/g, '')
}

const run = async () => {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const numericArg = args.find((value) => /^\d+$/.test(value))
  const limit = numericArg ? parseInt(numericArg, 10) : 20

  const client = getSanityClient()
  const assets = await client.fetch(
    '*[_type == "sanity.imageAsset" && (!defined(metadata.altText) || metadata.altText == "")][0...$limit]{_id, url, originalFilename, metadata}',
    {limit},
  )

  if (!assets.length) {
    console.log('[alt] No assets require alt text at this time.')
    return {updated: 0, total: 0}
  }

  let updated = 0
  for (const asset of assets) {
    try {
      const alt = await callOpenAI(asset)
      if (dryRun) {
        console.log(`[alt][dry-run] ${asset._id} => ${alt}`)
        continue
      }
      await client.patch(asset._id).set({'metadata.altText': alt}).commit()
      updated += 1
      console.log(`[alt] Updated ${asset._id}`)
    } catch (err) {
      console.error(`[alt] Failed to update ${asset._id}:`, err.message)
    }
  }

  return {updated, total: assets.length, dryRun}
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((err) => {
      console.error('[alt] Script failed:', err.message)
      process.exit(1)
    })
}

module.exports = {run}
