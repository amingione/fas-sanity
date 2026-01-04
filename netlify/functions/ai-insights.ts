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
        message: 'Using fallback data. Provide SANITY_API_TOKEN to enable live insights.',
        severity: 'default' as const,
      },
    ],
    recommendations: ['Configure SANITY_API_TOKEN so insights can query webhook stats.'],
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
      "recent": count(*[_type=="stripeWebhookEvent" && defined(receivedAt) && receivedAt >= $recent]),
      "previous": count(*[_type=="stripeWebhookEvent" && defined(receivedAt) && receivedAt >= $prev && receivedAt < $recent]),
      "failures": count(*[_type=="stripeWebhookEvent" && defined(receivedAt) && receivedAt >= $recent && status match "fail*"]),
      "typeMismatch": count(*[_type=="stripeWebhookEvent" && defined(receivedAt) && receivedAt >= $recent && summary match "type mismatch*"]),
      "idleMappings": count(*[_type=="mapping" && defined(_updatedAt) && _updatedAt < $idleCutoff]),
      "failTypes": *[_type=="stripeWebhookEvent" && defined(receivedAt) && receivedAt >= $recent && status match "fail*"].eventType
    }`

    const params = {
      recent: recentStart,
      prev: prevStart,
      idleCutoff: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const result = await client.fetch<{
      recent: number
      previous: number
      failures: number
      typeMismatch: number
      idleMappings: number
      failTypes: string[]
    }>(query, params)

    const {recent = 0, previous = 0, failures = 0, typeMismatch = 0, idleMappings = 0, failTypes = []} =
      result || {}
    const delta = previous ? (recent - previous) / Math.max(previous, 1) : recent > 0 ? 1 : 0
    const failureRate = recent ? failures / recent : 0

    const topFailType =
      failTypes.length > 0
        ? Object.entries(
            failTypes.reduce<Record<string, number>>((acc, t) => {
              acc[t] = (acc[t] || 0) + 1
              return acc
            }, {}),
          ).sort((a, b) => b[1] - a[1])[0]?.[0]
        : undefined

    const insights = [
      {
        id: 'volume',
        title: delta > 0.2 ? 'Webhook volume spike' : 'Webhook volume stable',
        message:
          delta > 0.2
            ? `Volume increased ${(delta * 100).toFixed(0)}% vs previous week.`
            : 'Volume change within normal range.',
        severity: delta > 0.2 ? 'caution' : 'default',
      },
      {
        id: 'failures',
        title: failureRate > 0.05 ? 'Elevated webhook errors' : 'Webhook errors normal',
        message: `${failures} failures out of ${recent || 0} events in the last 7 days${
          topFailType ? `; most common failing type: ${topFailType}` : ''
        }.`,
        severity: failureRate > 0.1 ? 'critical' : failureRate > 0.05 ? 'caution' : 'default',
      },
      {
        id: 'type-mismatch',
        title: typeMismatch > 0 ? 'Type mismatches detected' : 'Type mismatches minimal',
        message:
          typeMismatch > 0
            ? `${typeMismatch} events mention type mismatch in summaries. Review transformations.`
            : 'No type mismatch mentions in summaries this week.',
        severity: typeMismatch > 3 ? 'critical' : typeMismatch > 0 ? 'caution' : 'default',
      },
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
      delta > 0.2 ? 'Enable auto-scaling for worker queue during peak hours.' : null,
      failureRate > 0.05 ? 'Review webhook failure logs and add retries/backoff.' : null,
      typeMismatch > 0 ? 'Add type coercion for fields with frequent mismatches.' : null,
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
