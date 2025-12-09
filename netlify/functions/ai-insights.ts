import type {Handler} from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      insights: [
        {
          id: 'i1',
          title: 'Webhook volume spike',
          message: 'Volume increased 250% vs last week; ensure worker pool scales.',
          severity: 'caution',
        },
        {
          id: 'i2',
          title: 'High error rate on mapping order-total',
          message: '23% failures due to type mismatch; review transformations.',
          severity: 'critical',
        },
        {
          id: 'i3',
          title: 'Idle mappings',
          message: '5 mappings unused for 30 days; consider archiving.',
          severity: 'default',
        },
      ],
      recommendations: [
        'Enable auto-scaling for worker queue during peak hours.',
        'Add type coercion for order-total transformation.',
        'Archive unused mappings to reduce maintenance overhead.',
      ],
    }),
  }
}

export {handler}
