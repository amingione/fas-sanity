import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY

const stripe =
  stripeSecretKey &&
  new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20' as unknown as Stripe.StripeConfig['apiVersion'],
  })

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd'

const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

const sanityToken = process.env.SANITY_API_TOKEN

const client = sanityToken
  ? createClient({
      projectId,
      dataset,
      apiVersion: '2024-04-10',
      useCdn: false,
      token: sanityToken,
    })
  : null

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

    if (!client) {
      return {
        statusCode: 500,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Sanity API token not configured'}),
      }
    }

    const payload = JSON.parse(event.body || '{}')
    const sessionId = payload?.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return {
        statusCode: 400,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Missing sessionId'}),
      }
    }

    const session = (await stripe.financialConnections.sessions.retrieve(sessionId)) as any
    const accountId = session.accounts?.data?.[0]?.id

    if (!accountId) {
      return {
        statusCode: 422,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'No bank account returned from Stripe'}),
      }
    }

    const account = (await stripe.financialConnections.accounts.retrieve(accountId, {
      expand: ['account_numbers'],
    } as any)) as any

    const usBank = account.account_numbers?.us_bank_account

    const accountLast4 =
      usBank?.last4 || usBank?.account_number?.slice(-4) || account.display_name?.slice(-4) || ''
    const routingLast4 =
      usBank?.routing_number?.slice(-4) || account.routing_numbers?.[0]?.slice(-4) || ''

    const existingDefault = await client.fetch<boolean>(
      `defined(*[_type == "bankAccount" && defaultForChecks == true][0]._id)`
    )

    const docId = `bankAccount-${account.id}`
    const document = {
      _id: docId,
      _type: 'bankAccount',
      title:
        account.display_name ||
        account.institution?.name ||
        `${accountLast4 ? `Account ••••${accountLast4}` : 'Connected Account'}`,
      institutionName: account.institution?.name || usBank?.bank_name || '',
      holderName: account.account_holder_name || session.account_holder?.company?.name || '',
      stripeAccountId: account.id,
      accountLast4,
      routingLast4,
      status: 'active',
      defaultForChecks: !existingDefault,
      metadata: {
        lastSyncedAt: new Date().toISOString(),
        linkSessionId: sessionId,
      },
    }

    await client.createOrReplace(document)

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        ok: true,
        bankAccountId: docId,
        title: document.title,
        institution: document.institutionName,
        last4: accountLast4,
      }),
    }
  } catch (err: any) {
    console.error('finalizeFinancialConnection error', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: 'Failed to store bank account',
        detail: err?.message || String(err),
      }),
    }
  }
}
