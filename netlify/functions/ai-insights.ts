import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID
  const dataset = process.env.SANITY_STUDIO_DATASET
  const token =
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_AI_FEEDBACK_TOKEN

  const now = new Date()
  const recentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const fallback = {
    generatedAt: new Date().toISOString(),
    insights: [
      {
        id: 'fallback-volume',
        title: 'Webhook volume stable',
        message:
          'Using fallback data. Stripe webhook tracking has been removed; only non-webhook insights are available.',
        severity: 'default' as const,
      },
    ],
    recommendations: ['Configure SANITY_API_TOKEN so insights can query mapping stats.'],
  }

  if (!projectId || !dataset) {
    return {statusCode: 200, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(fallback)}
  }

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-10-01',
    useCdn: false,
    perspective: 'published',
  })

  try {
    const query = `{
      "idleMappings": count(*[_type=="mapping" && defined(_updatedAt) && _updatedAt < $idleCutoff])
    }`

    const params = {
      recent: recentStart,
      prev: prevStart,
      idleCutoff: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const result = await client.fetch<{idleMappings: number}>(query, params)

    const {idleMappings = 0} = result || {}

    const insights = [
      {
        id: 'idle-mappings',
        title: idleMappings > 0 ? 'Idle mappings detected' : 'Mappings active',
        message:
          idleMappings > 0
            ? `${idleMappings} mappings untouched for 30+ days. Consider archiving or reviewing.`
            : 'No idle mappings detected in the last 30 days.',
        severity: idleMappings > 5 ? 'caution' : 'default',
      },
    ]

    const recommendations = [
      idleMappings > 0 ? 'Archive or update idle mappings to reduce surface area.' : null,
    ].filter(Boolean) as string[]

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        insights,
        recommendations,
      }),
    }
  } catch (err) {
    console.error('ai-insights error', err)
    return {statusCode: 200, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(fallback)}
  }
}

export {handler}
