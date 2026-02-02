export async function handler(event: any) {
  const medusaUrl = process.env.MEDUSA_API_URL

  if (!medusaUrl) {
    return {
      statusCode: 500,
      body: 'MEDUSA_API_URL not configured',
    }
  }

  const res = await fetch(`${medusaUrl}/webhooks/shippo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // forward signature headers if you validate them in Medusa
      'shippo-signature': event.headers['shippo-signature'],
    },
    body: event.body,
  })

  const text = await res.text()

  return {
    statusCode: res.status,
    body: text,
  }
}
