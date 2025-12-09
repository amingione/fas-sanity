import type {Handler} from '@netlify/functions'

type MetricPoint = {timestamp: string; value: number}
type Breakdown = {label: string; value: number}

const now = () => new Date().toISOString()

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const hourly: MetricPoint[] = Array.from({length: 24}, (_, i) => {
    const date = new Date()
    date.setHours(date.getHours() - (23 - i))
    return {timestamp: date.toISOString(), value: Math.round(Math.random() * 500)}
  })

  const daily: MetricPoint[] = Array.from({length: 14}, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (13 - i))
    return {timestamp: date.toISOString().slice(0, 10), value: Math.round(Math.random() * 8000)}
  })

  const failures: Breakdown[] = [
    {label: 'mapping-validation', value: 12},
    {label: 'remote-4xx', value: 18},
    {label: 'remote-5xx', value: 7},
    {label: 'timeouts', value: 4},
  ]

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      generatedAt: now(),
      summary: {
        totalWebhooksHour: hourly.reduce((sum, p) => sum + p.value, 0),
        totalWebhooksDay: daily[daily.length - 1]?.value || 0,
        successRate: 98.4,
        avgProcessingMs: 120,
        errorRate: 1.6,
        topIntegration: 'stripe',
      },
      hourly,
      daily,
      failures,
    }),
  }
}

export {handler}
