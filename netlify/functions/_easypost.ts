import EasyPost from '@easypost/api'
import crypto from 'crypto'

const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY
const EASYPOST_WEBHOOK_SECRET = process.env.EASYPOST_WEBHOOK_SECRET

if (!EASYPOST_API_KEY) {
  throw new Error('Missing EASYPOST_API_KEY environment variable')
}

export const easypost = new EasyPost(EASYPOST_API_KEY)

export function verifyEasyPostSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !EASYPOST_WEBHOOK_SECRET) {
    return false
  }

  const hmac = crypto.createHmac('sha256', EASYPOST_WEBHOOK_SECRET)
  hmac.update(rawBody)
  const expectedSignature = hmac.digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
}

export function getWarehouseAddress() {
  return {
    company: process.env.WAREHOUSE_COMPANY || 'FAS Motorsports',
    street1: process.env.WAREHOUSE_STREET1 || '123 Main St',
    street2: process.env.WAREHOUSE_STREET2 || '',
    city: process.env.WAREHOUSE_CITY || 'Phoenix',
    state: process.env.WAREHOUSE_STATE || 'AZ',
    zip: process.env.WAREHOUSE_ZIP || '85001',
    country: 'US',
    phone: process.env.WAREHOUSE_PHONE || '555-555-5555',
  }
}
