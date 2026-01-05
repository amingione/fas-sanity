import type {SanityClient} from '@sanity/client'
import Stripe from 'stripe'

const RANDOM_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const PREFIX_RULES = [
  {match: ['trx', 'hellcat', 'trackhawk', 'charger', 'challenger', 'redeye', 'demon'], prefix: 'HC'},
  {match: ['hemi'], prefix: 'HE'},
  {match: ['ls', 'ls1', 'ls3', 'ls7'], prefix: 'LS'},
  {match: ['coyote', 'mustang'], prefix: 'CO'},
  {match: ['powerstroke', 'diesel'], prefix: 'PS'},
]

const defaultPrefix = 'UN'

const pickPrefix = (title = '', platform = ''): string => {
  const normalized = (platform || title || '').toLowerCase()
  for (const rule of PREFIX_RULES) {
    if (rule.match.some((token) => normalized.includes(token))) {
      return rule.prefix
    }
  }
  return defaultPrefix
}

const randomCode = (length: number) =>
  Array.from(
    {length},
    () => RANDOM_CHARSET[Math.floor(Math.random() * RANDOM_CHARSET.length)],
  ).join('')

export async function generateFasSKU(
  title = '',
  platform = '',
  client: Pick<SanityClient, 'fetch'>,
): Promise<string> {
  if (!client) {
    throw new Error('A Sanity client is required to generate SKUs')
  }

  const prefix = pickPrefix(title, platform)
  const ensureUnique = async (): Promise<string> => {
    const candidate = `${prefix}-${randomCode(4)}-FAS`
    const existing = await client.fetch('*[_type == "product" && sku == $sku][0]._id', {
      sku: candidate,
    })
    if (existing) {
      return ensureUnique()
    }
    return candidate
  }

  return ensureUnique()
}

export async function syncSKUToStripe(sku?: string | null, stripeProductId?: string | null) {
  if (!sku || !stripeProductId) return

  const secret = typeof process !== 'undefined' ? process.env?.STRIPE_SECRET_KEY : undefined
  if (!secret) {
    console.warn('STRIPE_SECRET_KEY is not configured; cannot sync SKU to Stripe.')
    return
  }

  try {
    const stripe = new Stripe(secret, {apiVersion: '2025-08-27.basil'})
    const product = await stripe.products.retrieve(stripeProductId)
    const merged = {...(product.metadata || {}), sku}
    await stripe.products.update(stripeProductId, {metadata: merged})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Failed to sync SKU to Stripe:', message)
  }
}
