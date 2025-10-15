import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY

const stripe =
  stripeSecretKey &&
  new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
  })

const BUSINESS_NAME =
  process.env.FINANCIAL_CONNECTIONS_BUSINESS_NAME ||
  process.env.PUBLIC_COMPANY_NAME ||
  'F.A.S. Motorsports LLC'

const DEFAULT_RETURN_URL =
  process.env.FINANCIAL_CONNECTIONS_RETURN_URL ||
  process.env.PUBLIC_STUDIO_URL ||
  'https://fasmotorsports.com'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Method not allowed'}),
      }
    }

    if (!stripe) {
      return {
        statusCode: 500,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Stripe secret key not configured'}),
      }
    }

    const payload = JSON.parse(event.body || '{}')
    const returnUrl = typeof payload?.returnUrl === 'string' ? payload.returnUrl : DEFAULT_RETURN_URL

    const session = await stripe.financialConnections.sessions.create({
      account_holder: {
        type: 'company',
        company: {
          name: BUSINESS_NAME,
        },
      },
      permissions: ['account_numbers', 'balances'],
      filters: {
        account_subtypes: ['checking', 'savings'],
      },
      payment_method_types: ['us_bank_account'],
      return_url: returnUrl,
    })

    if (!session.client_secret) {
      return {
        statusCode: 500,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Stripe session missing client secret'}),
      }
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        clientSecret: session.client_secret,
        sessionId: session.id,
      }),
    }
  } catch (err: any) {
    console.error('createFinancialConnectionSession error', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: 'Failed to create financial connection session',
        detail: err?.message || String(err),
      }),
    }
  }
}
