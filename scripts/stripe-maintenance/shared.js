const dotenv = require('dotenv')
dotenv.config()

const Stripe = require('stripe')
const {createClient} = require('@sanity/client')

const DEFAULT_SANITY_API_VERSION = '2024-10-01'
const DEFAULT_STRIPE_API_VERSION = '2024-06-20'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

function createSanityClient() {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd'
  const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
  const token = process.env.SANITY_API_TOKEN
  if (!token) {
    throw new Error(
      'Missing SANITY_API_TOKEN (or SANITY_API_TOKEN) for scripts/stripe-maintenance tools',
    )
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: DEFAULT_SANITY_API_VERSION,
    token,
    useCdn: false,
    perspective: 'raw',
  })
}

function createStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    throw new Error('Missing STRIPE_SECRET_KEY for Stripe maintenance scripts')
  }
  return new Stripe(secret, {apiVersion: DEFAULT_STRIPE_API_VERSION})
}

function normalizeStripeAddress(address, contact) {
  if (!address) return undefined
  return {
    name: (contact && contact.name) || address.name || undefined,
    phone: (contact && contact.phone) || address.phone || undefined,
    email: (contact && contact.email) || address.email || undefined,
    addressLine1: address.line1 || undefined,
    addressLine2: address.line2 || undefined,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postal_code || undefined,
    country: address.country || undefined,
  }
}

async function findInvoiceDocIdByStripeId(sanity, stripeInvoiceId) {
  if (!stripeInvoiceId) return null
  return (
    (await sanity.fetch(
      `*[_type == "invoice" && stripeInvoiceId == $id][0]._id`,
      {id: stripeInvoiceId},
    )) || null
  )
}

async function findCustomerIdByStripeId(sanity, stripeCustomerId) {
  if (!stripeCustomerId) return null
  return (
    (await sanity.fetch(
      `*[_type == "customer" && stripeCustomerId == $id][0]._id`,
      {id: stripeCustomerId},
    )) || null
  )
}

module.exports = {
  DEFAULT_SANITY_API_VERSION,
  DEFAULT_STRIPE_API_VERSION,
  requireEnv,
  createSanityClient,
  createStripeClient,
  normalizeStripeAddress,
  findInvoiceDocIdByStripeId,
  findCustomerIdByStripeId,
}
