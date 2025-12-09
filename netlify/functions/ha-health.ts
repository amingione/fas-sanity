import type {Handler} from '@netlify/functions'

type CheckResult = {name: string; status: 'healthy' | 'degraded' | 'down'; latencyMs: number}

const parseEndpoints = () => {
  const raw =
    process.env.SANITY_HA_CHECK_ENDPOINTS ||
    process.env.HA_CHECK_ENDPOINTS ||
    'https://api.sanity.io/v2021-06-07/ping,https://cdn.sanity.io/ping'
  return raw
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
}

const ping = async (url: string): Promise<CheckResult> => {
  const start = performance.now()
  try {
    const res = await fetch(url, {method: 'GET'})
    const latencyMs = Number((performance.now() - start).toFixed(2))
    return {
      name: url,
      status: res.ok ? 'healthy' : 'degraded',
      latencyMs,
    }
  } catch {
    const latencyMs = Number((performance.now() - start).toFixed(2))
    return {name: url, status: 'down', latencyMs}
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const endpoints = parseEndpoints()
  const checks = await Promise.all(endpoints.map((url) => ping(url)))
  const avgLatency =
    checks.length > 0
      ? Number(
          (checks.reduce((sum, entry) => sum + entry.latencyMs, 0) / checks.length).toFixed(2),
        )
      : 0

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      uptimeSLA: process.env.SANITY_HA_TARGET_SLA || '99.9%',
      avgLatencyMs: avgLatency,
      nodes: checks.map((check) => ({
        name: check.name,
        status: check.status === 'healthy' ? 'healthy' : 'degraded',
        latencyMs: check.latencyMs,
      })),
      checks: Object.fromEntries(checks.map((check) => [check.name, check.status])),
    }),
  }
}

export {handler}
