import type Stripe from 'stripe'

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/
const ENV_KEYS = [
  'STRIPE_SHIPPING_ALLOWED_COUNTRIES',
  'PUBLIC_STRIPE_SHIPPING_ALLOWED_COUNTRIES',
  'PUBLIC_SHIPPING_ALLOWED_COUNTRIES',
] as const

export type AllowedCountryCodes =
  Stripe.Checkout.SessionCreateParams.ShippingAddressCollection['allowed_countries']

const DEFAULT_ALLOWED_COUNTRIES: AllowedCountryCodes = ['US', 'CA']

function parseRawCountries(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,|\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readCountryEnvValue(): string {
  for (const key of ENV_KEYS) {
    const envValue = process.env[key] as string | undefined
    if (envValue && envValue.trim()) {
      return envValue
    }
  }
  return ''
}

export function resolveAllowedCountries(): AllowedCountryCodes {
  const raw = readCountryEnvValue()
  const parsed = parseRawCountries(raw)
    .map((code) => code.toUpperCase())
    .filter((code) => COUNTRY_CODE_PATTERN.test(code)) as AllowedCountryCodes

  if (parsed.length > 0) {
    return parsed
  }

  return DEFAULT_ALLOWED_COUNTRIES
}
