import { client } from '@/lib/client'
import type { Handler } from '@netlify/functions'

function decodeJwt(authHeader?: string | null): { sub?: string; email?: string } | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1]
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payloadJson = Buffer.from(parts[1], 'base64').toString()
    const payload = JSON.parse(payloadJson)
    return { sub: payload?.sub, email: payload?.email }
  } catch {
    return null
  }
}

const handler: Handler = async (event) => {
  try {
    const auth = decodeJwt(event.headers?.authorization || null)
    const userId = auth?.sub
    const email = (auth?.email || '').trim().toLowerCase()

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Prefer email-based lookup because orders store customerEmail
    const query = `*[_type == "order" && defined(customerEmail) && lower(customerEmail) == $email]{
      _id,
      customerEmail,
      totalAmount,
      status,
      createdAt,
      trackingNumber,
      shippingLabelUrl,
      packingSlipUrl
    } | order(createdAt desc)`

    const orders = email
      ? await client.fetch(query, { email })
      : []

    return {
      statusCode: 200,
      body: JSON.stringify({ orders }),
    };
  } catch (error) {
    console.error('Failed to fetch user orders:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to fetch user orders' }),
    };
  }
};

export default handler;
