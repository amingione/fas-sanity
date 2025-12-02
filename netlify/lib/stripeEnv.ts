const STRIPE_SECRET_ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'SANITY_STUDIO_STRIPE_SECRET_KEY',
  'VITE_STRIPE_SECRET_KEY',
] as const

function resolveStripeSecretKey(): string | undefined {
  for (const key of STRIPE_SECRET_ENV_KEYS) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function requireStripeSecretKey(): string {
  const secret = resolveStripeSecretKey()
  if (!secret) {
    throw new Error(
      `Missing Stripe secret key (set one of: ${STRIPE_SECRET_ENV_KEYS.join(', ')}).`,
    )
  }
  return secret
}

export {STRIPE_SECRET_ENV_KEYS, resolveStripeSecretKey, requireStripeSecretKey}
