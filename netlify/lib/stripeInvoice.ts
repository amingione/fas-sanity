const TRUTHY = new Set(['1', 'true', 'yes', 'on'])
const FALSY = new Set(['0', 'false', 'no', 'off'])

const AUTO_INVOICE_METADATA_KEYS = [
  'sanity_auto_invoice',
  'sanityAutoInvoice',
  'auto_create_invoice',
  'autoCreateInvoice',
  'create_invoice',
  'createInvoice',
]

const DEFAULT_AUTO_INVOICE =
  typeof process.env.STRIPE_AUTO_INVOICE_DEFAULT === 'string'
    ? TRUTHY.has(process.env.STRIPE_AUTO_INVOICE_DEFAULT.trim().toLowerCase())
    : false

export function shouldAutoCreateInvoice(meta: Record<string, string> | undefined | null): boolean {
  if (!meta) return DEFAULT_AUTO_INVOICE

  for (const key of AUTO_INVOICE_METADATA_KEYS) {
    const value = meta[key]
    if (typeof value !== 'string') continue
    const normalized = value.trim().toLowerCase()
    if (TRUTHY.has(normalized)) return true
    if (FALSY.has(normalized)) return false
  }

  return DEFAULT_AUTO_INVOICE
}
