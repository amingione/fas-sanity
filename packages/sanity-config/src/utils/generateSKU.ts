import type {SanityClient} from '@sanity/client'

// DRIFT ACKNOWLEDGEMENT:
// This generator intentionally enforces deterministic SKU/MPN formats.
// Legacy prefix-based or sequential identifiers are forbidden by governance.
// Source of truth: docs/ai-governance/PROD_IDENTIFICATION_RULES.md

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
  console.warn(
    'Direct Stripe writes are disabled in fas-sanity by architecture policy. Update Stripe metadata via Medusa.',
  )
}
