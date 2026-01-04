const STRIPE_SECRET_ENV_KEY = 'STRIPE_SECRET_KEY'

function resolveStripeSecretKey(): string | undefined {
  const value = process.env[STRIPE_SECRET_ENV_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireStripeSecretKey(): string {
  const secret = resolveStripeSecretKey()
  if (!secret) {
    throw new Error(`Missing Stripe secret key (set ${STRIPE_SECRET_ENV_KEY}).`)
  }
  return secret
}

export {STRIPE_SECRET_ENV_KEY, resolveStripeSecretKey, requireStripeSecretKey}
